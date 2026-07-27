import { NextRequest } from 'next/server'
import { transaction, query, queryOne } from '@/lib/db'
import { enqueueOrderConfirmationEmail } from '@/lib/sqs'
import { sendProviderNewOrderEmail } from '@/lib/notifications/email'
import { calculateEstimatedDeliveryDate } from '@/lib/delivery-estimate'
import { getActiveGateway } from '@/lib/payment'
import { getMixedLoadProductTypeId } from '@/lib/product-types'
import { checkProviderOrderEligibility } from '@/lib/subscription'
import { getGstRate } from '@/lib/gst'
import { randomUUID } from 'crypto'
import {
  successResponse, errorResponse, validationError,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

interface ServiceItem {
  type:               'per_kg' | 'per_unit'
  service_id:         number
  service_name:       string
  weight_kg?:         number
  product_type_id?:   number | null
  product_type_name?: string
  icon?:              string
  quantity?:          number
  unit_price:         number
  line_total:         number
  is_express:         boolean
  express_multiplier: number
}

interface CreateOrderBody {
  laundry_profile_id:    number
  address_id:            number
  pickup_address:        string
  delivery_address:      string
  pickup_date:           string
  pickup_time_slot:      string
  is_express:            boolean
  services:              ServiceItem[]
  payment_method:        string   // 'cod'|'wallet'|'wallet+cod'|'wallet+upi'|'upi'|'card'
  wallet_amount?:        number   // amount to use from wallet
  coupon_code?:          string
  special_instructions?: string
  customer_gstin?:       string   // optional — B2B customers (hotels/hospitals) claiming ITC
  draft_order_number?:   string   // idempotency key from cart
}

// Maps order_fee_config.code → valid order_adjustments.kind
// CHECK constraint: 'coupon','manual_discount','delivery_fee','express_fee','surcharge','rounding','other'
function feeCodeToKind(code: string): string {
  if (code === 'delivery_fee')      return 'delivery_fee'
  if (code === 'express_surcharge') return 'express_fee'
  return 'other'
}

// For 'wallet+cod' → 'cod', 'wallet+upi' → 'upi', else returns the method itself
function extractSecondaryMethod(pm: string): string {
  if (!pm.includes('+')) return pm
  return pm.split('+').find(p => p !== 'wallet') ?? pm
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: CreateOrderBody
  try { body = await req.json() } catch { return errorResponse('Invalid request body', 400) }

  const errors: Record<string, string> = {}
  if (!body.laundry_profile_id)                errors.laundry_profile_id = 'Provider is required'
  if (!body.pickup_address)                    errors.pickup_address     = 'Pickup address is required'
  if (!body.pickup_date)                       errors.pickup_date        = 'Pickup date is required'
  if (!body.pickup_time_slot)                  errors.pickup_time_slot   = 'Pickup time slot is required'
  if (!body.services?.length)                  errors.services           = 'At least one service is required'
  if (!body.payment_method)                    errors.payment_method     = 'Payment method is required'
  const customerGstin = body.customer_gstin?.trim().toUpperCase() || null
  if (customerGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(customerGstin))
    errors.customer_gstin = 'Enter a valid GST number (e.g. 22AAAAA0000A1Z5)'
  if (Object.keys(errors).length > 0) return validationError(errors)

  for (const svc of body.services) {
    if (svc.type === 'per_kg' && (!svc.weight_kg || svc.weight_kg < 0.5))
      return errorResponse(`"${svc.service_name}" requires minimum 0.5 kg`, 400)
    if (svc.type === 'per_unit' && (!svc.quantity || svc.quantity < 1))
      return errorResponse(`"${svc.service_name}" requires quantity ≥ 1`, 400)
  }

  const paymentMethod   = body.payment_method.toLowerCase()
  const walletRequested = body.wallet_amount && body.wallet_amount > 0 ? body.wallet_amount : 0
  const usesWallet      = paymentMethod === 'wallet' || paymentMethod.startsWith('wallet+')
  const isCodBased      = paymentMethod === 'cod' || paymentMethod.includes('+cod')
  const secondaryMethod = extractSecondaryMethod(paymentMethod)

  // Resolve the actually-active gateway once — online payments must use whichever
  // provider the admin has configured, not a hardcoded one. Only relevant if some
  // portion of the order isn't covered by COD/wallet (checked again once wallet
  // coverage is computed inside the transaction).
  const gatewayInfo = !isCodBased ? await getActiveGateway() : null
  const onlineProvider = gatewayInfo?.provider ?? 'payu'

  try {
    // ---- Idempotency --------------------------------------------------------
    // Only short-circuit on a *paid* match — re-submitting the same draft after
    // a successful payment should return the existing order, not double-charge.
    // If the previous attempt under this draft number never completed payment
    // (abandoned online checkout, failed payment, etc.), it's a stale/zombie
    // order — void it and fall through to create a fresh one for this attempt,
    // so a retry (e.g. switching to COD from checkout) isn't silently bound to
    // the old attempt's payment_method/status.
    let staleDraftVoided = false
    if (body.draft_order_number) {
      const existing = await query(
        `SELECT id, public_id, order_number, total_amount, payment_status, payment_method
         FROM orders WHERE order_number = $1 AND customer_id = $2`,
        [body.draft_order_number, userId]
      )
      if (existing.rowCount! > 0) {
        const o = existing.rows[0]
        if (o.payment_status === 'paid') {
          const wasCOD = (o.payment_method ?? '').includes('cod')
          return successResponse({
            order_id:              o.public_id,
            order_number:          o.order_number,
            total_amount:          parseFloat(o.total_amount),
            payment_required:      o.payment_status === 'pending' && !wasCOD,
            payment_fully_covered: false,
            payment_method:        o.payment_method,
            already_existed:       true,
          }, 200)
        }
        await query(
          `UPDATE orders SET status = 'failed', payment_status = 'failed', updated_at = NOW()
           WHERE id = $1`,
          [o.id]
        )
        await query(
          `UPDATE payments SET status = 'cancelled', updated_at = NOW()
           WHERE order_id = $1 AND status IN ('initiated', 'pending', 'failed')`,
          [o.id]
        )
        staleDraftVoided = true
      }
    }

    const result = await transaction(async (client) => {
      await client.query(`SELECT set_config('app.current_user_id', $1, TRUE)`, [userId])

      // ---- Provider ---------------------------------------------------------
      const providerRes = await client.query(
        `SELECT lp.id, lp.business_name, lp.latitude, lp.longitude,
                lp.has_gst, lp.gst_inclusive_pricing
         FROM laundry_profiles lp
         WHERE lp.id = $1 AND lp.status = 'active' AND lp.is_verified = TRUE`,
        [body.laundry_profile_id]
      )
      if (providerRes.rowCount === 0) throw new Error('INVALID_PROVIDER')
      const provider = providerRes.rows[0]

      // ---- Subscription gate -------------------------------------------------
      // A provider whose subscription has lapsed or who's hit their plan's
      // monthly order cap can't take on new orders until they renew/upgrade.
      const eligibility = await checkProviderOrderEligibility(client, provider.id)
      if (!eligibility.eligible) throw new Error(eligibility.reason)

      // ---- Customer ---------------------------------------------------------
      const custRes = await client.query(
        `SELECT u.email, u.full_name, u.status
         FROM users u JOIN customer_profiles cp ON cp.user_id = u.id WHERE u.id = $1`,
        [userId]
      )
      if (custRes.rowCount === 0) throw new Error('CUSTOMER_NOT_FOUND')
      const customer = custRes.rows[0]

      // Suspension must block ordering even for sessions issued before the
      // suspension (the JWT alone doesn't reflect account status).
      if (customer.status === 'suspended')
        throw new Error('Your account has been suspended. Please contact support.')

      // ---- Subtotal ---------------------------------------------------------
      const subtotal = Math.round(
        body.services.reduce((s, svc) => s + svc.line_total, 0) * 100
      ) / 100

      // ---- Pickup pincode + coordinates --------------------------------------
      // Pickup pincode is stored denormalized so the delivery available-orders
      // query can match it directly — it was never being populated before,
      // which silently broke region matching for every order (the query
      // would fall through to a fragile city-substring match instead).
      // Coordinates (best-effort — NULL if this address was never geocoded)
      // feed the distance-based delivery-fee calculation right below.
      let pickupPincode: string | null = null
      let pickupLat: number | null = null
      let pickupLng: number | null = null
      if (body.address_id) {
        const addrRes = await client.query(
          `SELECT postal_code, latitude, longitude FROM customer_addresses WHERE id = $1 AND customer_profile_id = (
             SELECT id FROM customer_profiles WHERE user_id = $2
           )`,
          [body.address_id, userId]
        )
        pickupPincode = addrRes.rows[0]?.postal_code ?? null
        pickupLat = addrRes.rows[0]?.latitude ?? null
        pickupLng = addrRes.rows[0]?.longitude ?? null
      }

      const distanceRes = await client.query<{ distance_km: string | null }>(
        `SELECT haversine_km($1, $2, $3, $4)::TEXT AS distance_km`,
        [pickupLat, pickupLng, provider.latitude, provider.longitude]
      )
      const distanceKm = distanceRes.rows[0]?.distance_km != null
        ? parseFloat(distanceRes.rows[0].distance_km) : null

      // ---- Fees from order_fee_config via DB function ----------------------
      // calculate_order_fees() reads order_fee_config, respects is_active,
      // skips express_surcharge if !is_express, applies free_above_amount cap
      const feesRes = await client.query(
        `SELECT calculate_order_fees($1, $2, $3, $4) AS fees`,
        [subtotal, body.is_express, distanceKm, body.laundry_profile_id]
      )
      const feeRows: Array<{
        code:          string
        display_name:  string
        charge_type:   string
        amount:        number
        is_free:       boolean
        taxable_base?: number
      }> = feesRes.rows[0].fees ?? []
      const feesTotal = feeRows.reduce((s, f) => s + parseFloat(String(f.amount)), 0)

      // ---- Coupon -----------------------------------------------------------
      let discountAmount    = 0
      let appliedCouponCode: string | null = null
      if (body.coupon_code) {
        const couponRes = await client.query(
          `SELECT code, discount_type, discount_value, max_discount,
                  min_order_amount, usage_limit_global, usage_limit_per_user,
                  first_order_only, laundry_profile_id
           FROM coupons
           WHERE code = $1 AND is_active = TRUE
             AND (starts_at IS NULL OR starts_at <= NOW())
             AND (ends_at   IS NULL OR ends_at   >= NOW())`,
          [body.coupon_code.toUpperCase()]
        )
        if (couponRes.rowCount! > 0) {
          const c = couponRes.rows[0]
          const meetsMin = !c.min_order_amount || subtotal >= parseFloat(c.min_order_amount)

          // Usage-limit checks mirror /api/customer/coupons/validate exactly —
          // a redemption tied to a failed/cancelled order never actually
          // consumed the coupon, so it must not count against either limit.
          let perUserOk = true
          if (c.usage_limit_per_user) {
            const usage = await client.query(
              `SELECT COUNT(*)::int AS n FROM coupon_redemptions cr
               LEFT JOIN orders o ON o.id = cr.order_id
               WHERE cr.coupon_code = $1 AND cr.user_id = $2
                 AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))`,
              [c.code, userId]
            )
            perUserOk = usage.rows[0].n < parseInt(c.usage_limit_per_user)
          }

          // Global cap on TOTAL redemptions across every customer — distinct
          // from usage_limit_per_user. A shared coupon like a first-order
          // discount has no global cap (usage_limit_global is NULL) and stays
          // available to every new customer; is_active is a separate,
          // admin-only on/off switch that a redemption must never touch.
          let globalOk = true
          if (c.usage_limit_global) {
            const globalUsage = await client.query(
              `SELECT COUNT(*)::int AS n FROM coupon_redemptions cr
               LEFT JOIN orders o ON o.id = cr.order_id
               WHERE cr.coupon_code = $1
                 AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))`,
              [c.code]
            )
            globalOk = globalUsage.rows[0].n < parseInt(c.usage_limit_global)
          }

          // first_order_only — same "actually placed" definition used by
          // /api/customer/coupons/validate and the dashboard/orders-list
          // routes: a pending online-payment order that hasn't paid yet
          // doesn't count as placed. Scoped to the coupon's own provider
          // when it has one — a provider's "first order with us" coupon
          // only cares about history with THAT provider.
          let firstOrderOk = true
          if (c.first_order_only) {
            const historyRes = await client.query(
              `SELECT COUNT(*)::int AS n
               FROM orders
               WHERE customer_id = $1
                 AND status NOT IN ('cancelled', 'failed', 'rejected')
                 AND (payment_method LIKE '%cod%' OR payment_status = 'paid')
                 AND ($2::BIGINT IS NULL OR laundry_profile_id = $2)`,
              [userId, c.laundry_profile_id]
            )
            firstOrderOk = historyRes.rows[0].n === 0
          }

          // Provider-scoped coupon — the real enforcement point: reject if
          // it doesn't belong to this order's actual provider. Frontend
          // state (checkout selection) is never trusted here.
          const providerOk = c.laundry_profile_id == null
            || Number(c.laundry_profile_id) === Number(body.laundry_profile_id)

          if (meetsMin && perUserOk && globalOk && firstOrderOk && providerOk) {
            discountAmount = c.discount_type === 'percent'
              ? (subtotal * parseFloat(c.discount_value)) / 100
              : parseFloat(c.discount_value)
            if (c.max_discount) discountAmount = Math.min(discountAmount, parseFloat(c.max_discount))
            discountAmount = Math.min(Math.round(discountAmount * 100) / 100, subtotal)
            appliedCouponCode = c.code
          }
        }
      }

      const totalAmount = Math.max(
        0,
        Math.round((subtotal + feesTotal - discountAmount) * 100) / 100
      )

      // Unlike a checkout fee, GST here is a portion already embedded in the
      // subtotal (the provider's GST-inclusive-pricing toggle folds it into
      // each service's price at display time — see the customer-facing
      // services endpoint) — so it's reverse-derived from the subtotal, not
      // added on top. Purely informational: it feeds orders.tax_amount for
      // the invoice's taxable-value/GST breakdown; total_amount is unaffected.
      const taxAmount = (provider.has_gst && provider.gst_inclusive_pricing)
        ? Math.round((subtotal - subtotal / (1 + (await getGstRate()) / 100)) * 100) / 100
        : 0

      // ---- Wallet -----------------------------------------------------------
      let effectiveWalletAmount = 0
      if (usesWallet && walletRequested > 0) {
        const balResult = await client.query(
          `SELECT COALESCE(get_wallet_balance($1), 0) AS balance, wa.id AS wallet_id
           FROM wallet_accounts wa WHERE wa.user_id = $1 AND wa.currency = 'INR'
           FOR UPDATE`,
          [userId]
        )
        if (balResult.rowCount === 0) throw new Error('WALLET_NOT_FOUND')
        const balance = parseFloat(balResult.rows[0].balance)
        effectiveWalletAmount = Math.min(walletRequested, totalAmount, balance)
        effectiveWalletAmount = Math.round(effectiveWalletAmount * 100) / 100
        if (effectiveWalletAmount <= 0) throw new Error('INSUFFICIENT_WALLET_BALANCE')
      }

      const remainingAfterWallet = Math.max(
        0,
        Math.round((totalAmount - effectiveWalletAmount) * 100) / 100
      )
      const walletFullyCovered = effectiveWalletAmount > 0 && remainingAfterWallet <= 0

      // ---- COD eligibility --------------------------------------------------
      if (isCodBased) {
        const codRes = await client.query(
          `SELECT cod_enabled, cod_max_order_amount FROM payment_gateway_config LIMIT 1`
        )
        if (codRes.rowCount! > 0) {
          const { cod_enabled, cod_max_order_amount } = codRes.rows[0]
          // For wallet+cod: only the COD portion is checked against the limit
          const codCheckAmount = effectiveWalletAmount > 0 ? remainingAfterWallet : totalAmount
          if (!cod_enabled) throw new Error('COD_DISABLED')
          if (codCheckAmount > parseFloat(cod_max_order_amount)) throw new Error('COD_LIMIT_EXCEEDED')
        }
      }

      // ---- Insert order -----------------------------------------------------
      const orderNumber    = (body.draft_order_number && !staleDraftVoided)
        ? body.draft_order_number
        : `ORD${Date.now()}`
      const paymentStatus  = walletFullyCovered ? 'paid' : 'pending'

      // Estimated delivery DATE (not a time slot) — based on the slowest
      // service in the order, provider turnaround overrides, and express.
      const estimatedDeliveryDate = await calculateEstimatedDeliveryDate(
        (text, params) => client.query(text, params),
        {
          providerId: body.laundry_profile_id,
          pickupDate: body.pickup_date,
          items: body.services.map(svc => ({ serviceId: svc.service_id, isExpress: svc.is_express })),
        }
      )

      const orderRes = await client.query(
        `INSERT INTO orders (
           order_number, customer_id, laundry_profile_id, delivery_profile_id,
           status, pickup_address, delivery_address, pickup_pincode,
           pickup_date, pickup_time_slot, special_instructions,
           is_express, subtotal, tax_amount, discount_amount,
           total_amount, payment_status, payment_method, assignment_status,
           estimated_delivery_date, customer_gstin
         ) VALUES ($1,$2,$3,NULL,'pending',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'unassigned',$17,$18)
         RETURNING id, public_id`,
        [
          orderNumber, userId, body.laundry_profile_id,
          body.pickup_address, body.delivery_address ?? body.pickup_address, pickupPincode,
          body.pickup_date, body.pickup_time_slot, body.special_instructions ?? null,
          body.is_express, subtotal, taxAmount, discountAmount, totalAmount,
          paymentStatus, paymentMethod, estimatedDeliveryDate, customerGstin,
        ]
      )
      const orderId = orderRes.rows[0].id
      const orderPublicId = orderRes.rows[0].public_id

      // ---- Order items ------------------------------------------------------
      // Per-kg items aren't tied to a specific garment — resolve the shared
      // "Regular Laundry (Mixed)" product type once up front rather than
      // hardcoding an id that may not exist in every environment.
      const hasKgItem = body.services.some(svc => svc.type === 'per_kg')
      const mixedLoadProductTypeId = hasKgItem ? await getMixedLoadProductTypeId(client) : null

      for (const svc of body.services) {
        const productTypeId = svc.type === 'per_unit' ? (svc.product_type_id ?? 1) : mixedLoadProductTypeId
        const weightKg      = svc.type === 'per_kg'   ? svc.weight_kg              : null
        const quantity      = svc.type === 'per_unit' ? (svc.quantity ?? 1)        : 1
        const itemRes = await client.query(
          `INSERT INTO order_items (order_id, product_type_id, quantity, weight_kg)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [orderId, productTypeId, quantity, weightKg]
        )
        await client.query(
          `INSERT INTO order_item_services
             (order_item_id, service_id, unit_price, line_total, is_express, express_multiplier)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [itemRes.rows[0].id, svc.service_id, svc.unit_price,
           svc.line_total, svc.is_express, svc.express_multiplier]
        )
      }

      // ---- Adjustments: all fees from order_fee_config ---------------------
      // Store fee.code in metadata so the order detail page can
      // look up the display_name from order_fee_config (no static mapping)
      for (const fee of feeRows) {
        await client.query(
          `INSERT INTO order_adjustments (order_id, kind, amount, note, metadata)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            orderId,
            feeCodeToKind(fee.code),   // valid CHECK constraint value
            fee.amount,
            fee.display_name,          // display_name from order_fee_config
            JSON.stringify({
              fee_code: fee.code, is_free: fee.is_free,
              ...(fee.taxable_base != null ? { taxable_base: fee.taxable_base } : {}),
            }),
          ]
        )
      }

      // Coupon discount
      if (appliedCouponCode && discountAmount > 0) {
        await client.query(
          `INSERT INTO order_adjustments (order_id, kind, amount, note, metadata)
           VALUES ($1,'coupon',$2,$3,$4)`,
          [
            orderId, -discountAmount,
            `Coupon: ${appliedCouponCode}`,
            JSON.stringify({ coupon_code: appliedCouponCode }),
          ]
        )
        await client.query(
          `INSERT INTO order_coupons (order_id, coupon_code, amount_discounted)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [orderId, appliedCouponCode, discountAmount]
        )
        await client.query(
          `INSERT INTO coupon_redemptions (coupon_code, user_id, order_id, amount_discounted)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [appliedCouponCode, userId, orderId, discountAmount]
        )
        // is_active is an admin-only on/off switch and must never be flipped
        // by a redemption — usage_limit_global/usage_limit_per_user (checked
        // above) are what actually cap how many times a coupon can be used.
      }

      // ---- Wallet debit (atomic inside transaction) -------------------------
      // wallet_debit_for_order(): locks wallet, inserts wallet_transactions,
      // returns wallet_transaction_id.
      // Requires migration 20 (wallet_transactions.order_id BIGSERIAL → BIGINT)
      let walletTxnId: number | null = null
      if (effectiveWalletAmount > 0) {
        walletTxnId = await client.query(
          `SELECT wallet_debit_for_order($1,$2,$3,$4) AS txn_id`,
          [userId, orderId, effectiveWalletAmount, `Payment for order ${orderNumber}`]
        ).then(r => r.rows[0].txn_id)
        const walletMerchantTxnId = `WALLET-${orderId}-${randomUUID()}`

        await client.query(
          `INSERT INTO payments
            (order_id, amount, payment_method, status, wallet_transaction_id, provider, merchant_txn_id)
          VALUES ($1,$2,'wallet','completed',$3,$4,$5)`,
          [orderId, effectiveWalletAmount, walletTxnId, 'wallet', walletMerchantTxnId]
        )
      }

      // ---- Remaining payment row -------------------------------------------
      if (remainingAfterWallet > 0) {
        const isOnline = secondaryMethod !== 'cod'
        if (isOnline && !gatewayInfo) throw new Error('NO_GATEWAY_CONFIGURED')

        const provider = isOnline ? onlineProvider : 'cod'
        const status   = isOnline ? 'initiated' : 'pending'
        const merchantTxnId = isOnline
          ? `${onlineProvider.toUpperCase()}-${orderId}-${randomUUID()}`
          : `COD-${orderId}-${randomUUID()}`

        await client.query(
          `INSERT INTO payments
            (order_id, amount, payment_method, status, provider, merchant_txn_id, gateway_config_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, remainingAfterWallet, secondaryMethod, status, provider, merchantTxnId, isOnline ? gatewayInfo!.id : null]
        )
      } else if (effectiveWalletAmount <= 0) {
        const isOnline = paymentMethod !== 'cod'
        if (isOnline && !gatewayInfo) throw new Error('NO_GATEWAY_CONFIGURED')

        const provider = isOnline ? onlineProvider : 'cod'
        const status   = isOnline ? 'initiated' : 'pending'
        const merchantTxnId = isOnline
          ? `${onlineProvider.toUpperCase()}-${orderId}-${randomUUID()}`
          : `COD-${orderId}-${randomUUID()}`

        await client.query(
          `INSERT INTO payments
            (order_id, amount, payment_method, status, provider, merchant_txn_id, gateway_config_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, totalAmount, paymentMethod, status, provider, merchantTxnId, isOnline ? gatewayInfo!.id : null]
        )
      }
      // walletFullyCovered → no second payment row needed

      // ---- Customer stats --------------------------------------------------
      await client.query(
        `UPDATE customer_profiles
         SET total_orders = total_orders + 1, last_order_at = NOW()
         WHERE user_id = $1`,
        [userId]
      )

      return {
        orderId, orderPublicId, orderNumber, totalAmount,
        walletAmountUsed:    effectiveWalletAmount,
        remainingAmount:     remainingAfterWallet,
        walletFullyCovered,
        paymentFullyCovered: walletFullyCovered || (isCodBased && effectiveWalletAmount <= 0),
        customer, provider, feeRows,
        pickupDate:     body.pickup_date,
        pickupTimeSlot: body.pickup_time_slot,
      }
    })

    // ---- Post-transaction --------------------------------------------------
    // NOTE: delivery auto-assignment intentionally does NOT run here anymore.
    // It runs when the laundry provider CONFIRMS the order
    // (app/api/laundry/orders/[id]/status) so partners are only assigned to
    // orders that are actually going ahead.

    const needsGatewayPayment = !result.paymentFullyCovered && !isCodBased

    // Only clear the cart once the order doesn't need any further online
    // payment step — for COD/wallet-fully-covered orders the purchase is
    // final here. For orders still awaiting a gateway payment, the cart must
    // survive (so checkout can be retried) until the PayU/Cashfree callback
    // actually confirms the payment.
    if (!needsGatewayPayment) {
      try { await query(`DELETE FROM shopping_carts WHERE user_id = $1`, [userId]) }
      catch { /* non-fatal */ }
    }

    // try {
    //   await enqueueOrderConfirmationEmail({
    //     orderId:       result.orderId,
    //     orderNumber:   result.orderNumber,
    //     customerEmail: result.customer.email,
    //     customerName:  result.customer.full_name,
    //     totalAmount:   result.totalAmount,
    //     pickupDate:    result.pickupDate,
    //     pickupTimeSlot:result.pickupTimeSlot,
    //     providerName:  result.provider.business_name,
    //     paymentMethod: body.payment_method,
    //   })
    // } catch (e) { console.warn('[orders/create] SQS error:', e) }

    // Email the provider about the new order — but only when no gateway
    // payment is still pending, so providers never hear about orders whose
    // payment might be abandoned. (Gateway-paid orders currently reach the
    // provider via the dashboard/in-app notification once paid.)
    if (!needsGatewayPayment) {
      try {
        const providerContact = await queryOne<{ email: string | null; business_name: string }>(
          `SELECT pu.email, lp.business_name
           FROM laundry_profiles lp INNER JOIN users pu ON pu.id = lp.user_id
           WHERE lp.id = $1`,
          [result.provider.id]
        )
        if (providerContact?.email) {
          const baseUrl = process.env.NEXT_PUBLIC_LAUNDRY_URL || 'http://localhost:3000'
          sendProviderNewOrderEmail({
            to: providerContact.email,
            providerName: providerContact.business_name,
            orderNumber: result.orderNumber,
            pickupDate: result.pickupDate,
            pickupSlot: result.pickupTimeSlot,
            orderUrl: `${baseUrl}/laundry/orders/${result.orderPublicId}`,
          }).catch(e => console.error('[orders/create] provider new-order email failed:', e))
        }
      } catch (e) {
        console.error('[orders/create] provider new-order lookup failed:', e)
      }
    }

    return successResponse({
      order_id:              result.orderPublicId,
      order_number:          result.orderNumber,
      total_amount:          result.totalAmount,
      wallet_amount_used:    result.walletAmountUsed,
      remaining_amount:      result.remainingAmount,
      payment_required:      needsGatewayPayment,
      payment_fully_covered: result.walletFullyCovered,
      payment_method:        body.payment_method,
      fees:                  result.feeRows,
    }, 201)

  } catch (error: any) {
    console.error('[POST /api/customer/orders/create]', error)
    if (error.message === 'INVALID_PROVIDER')            return errorResponse('Selected provider is not available', 400)
    if (error.message === 'NO_ACTIVE_SUBSCRIPTION')      return errorResponse('This provider is not currently accepting orders. Please choose another provider.', 400)
    if (error.message === 'SUBSCRIPTION_EXPIRED')        return errorResponse('This provider’s subscription has expired and they cannot accept new orders right now. Please choose another provider.', 400)
    if (error.message === 'ORDER_LIMIT_REACHED')         return errorResponse('This provider has reached their order limit for this billing cycle. Please choose another provider.', 400)
    if (error.message === 'CUSTOMER_NOT_FOUND')          return errorResponse('Customer profile not found', 404)
    if (error.message === 'COD_DISABLED')                return errorResponse('Cash on Delivery is not available', 400)
    if (error.message === 'COD_LIMIT_EXCEEDED')          return errorResponse('Order amount exceeds COD limit', 400)
    if (error.message === 'WALLET_NOT_FOUND')            return errorResponse('Wallet not found', 400)
    if (error.message === 'INSUFFICIENT_WALLET_BALANCE') return errorResponse('Insufficient wallet balance', 400)
    if (error.message === 'NO_GATEWAY_CONFIGURED')       return errorResponse('No payment gateway is configured. Please contact support.', 503)
    return serverErrorResponse('Failed to create order')
  }
}
