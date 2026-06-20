import { NextRequest } from 'next/server'
import { z } from 'zod'
import { queryOne } from '@/lib/db'
import { successResponse, errorResponse, validationError } from '@/lib/api-response'

const calculateSchema = z.object({
  items: z.array(
    z.object({
      productTypeId: z.number(),
      serviceId: z.number(),
      quantity: z.number().min(1),
    })
  ).min(1, 'At least one item is required'),
  laundryServiceId: z.number().optional(),
  promoCode: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const validation = calculateSchema.safeParse(body)
    
    if (!validation.success) {
      return validationError(validation.error.flatten().fieldErrors as any)
    }
    
    const { items, laundryServiceId, promoCode } = validation.data
    
    let totalAmount = 0
    const itemsBreakdown: any[] = []
    
    // Calculate price for each item
    for (const item of items) {
      // Get pricing
      let pricing = null
      
      if (laundryServiceId) {
        // Get custom pricing from specific laundry service
        pricing = await queryOne(
          `
          SELECT 
            lsp.price,
            pt.name as product_name,
            s.name as service_name,
            s.unit
          FROM laundry_pricing lsp
          INNER JOIN product_types pt ON lsp.product_type_id = pt.id
          INNER JOIN services s ON lsp.service_id = s.id
          WHERE lsp.laundry_profile_id = $1
            AND lsp.product_type_id = $2
            AND lsp.service_id = $3
            AND lsp.is_active = true
          `,
          [laundryServiceId, item.productTypeId, item.serviceId]
        )
      }
      
      if (!pricing) {
        // Use base pricing from services table
        pricing = await queryOne(
          `
          SELECT 
            s.base_price as price,
            pt.name as product_name,
            s.name as service_name,
            s.unit
          FROM services s
          CROSS JOIN product_types pt
          WHERE s.id = $1
            AND pt.id = $2
            AND s.is_active = true
            AND pt.is_active = true
          `,
          [item.serviceId, item.productTypeId]
        )
      }
      
      if (!pricing) {
        return errorResponse(
          `Invalid product type or service for item`,
          400,
          'INVALID_ITEM'
        )
      }
      
      const price = parseFloat(pricing.price)
      const itemTotal = price * item.quantity
      totalAmount += itemTotal
      
      itemsBreakdown.push({
        productType: pricing.product_name,
        service: pricing.service_name,
        quantity: item.quantity,
        unitPrice: price,
        unit: pricing.unit,
        totalPrice: itemTotal,
      })
    }
    
    // Apply taxes
    const taxRate = 0.18 // 18% GST (India)
    const taxAmount = totalAmount * taxRate
    
    // Apply promo code if provided
    let discountAmount = 0
    let promoDetails = null
    
    if (promoCode) {
      const promo = await queryOne(
        `
        SELECT 
          id,
          name,
          discount_type,
          discount_value,
          max_discount_amount,
          min_order_amount
        FROM promotions
        WHERE LOWER(code) = LOWER($1)
          AND is_active = true
          AND starts_at <= NOW()
          AND (ends_at IS NULL OR ends_at >= NOW())
          AND (global_usage_limit IS NULL OR global_used_count < global_usage_limit)
        `,
        [promoCode]
      )
      
      if (promo) {
        // Check minimum order amount
        if (totalAmount >= parseFloat(promo.min_order_amount || 0)) {
          if (promo.discount_type === 'percent') {
            discountAmount = (totalAmount * parseFloat(promo.discount_value)) / 100
            
            // Apply max discount cap
            if (promo.max_discount_amount) {
              discountAmount = Math.min(
                discountAmount,
                parseFloat(promo.max_discount_amount)
              )
            }
          } else if (promo.discount_type === 'fixed') {
            discountAmount = parseFloat(promo.discount_value)
          }
          
          // Ensure discount doesn't exceed total
          discountAmount = Math.min(discountAmount, totalAmount)
          
          promoDetails = {
            code: promoCode,
            name: promo.name,
            discountType: promo.discount_type,
            discountValue: parseFloat(promo.discount_value),
            appliedDiscount: discountAmount,
          }
        }
      }
    }
    
    // Calculate final amount
    const subtotal = totalAmount
    const finalAmount = subtotal - discountAmount + taxAmount
    
    return successResponse({
      breakdown: {
        items: itemsBreakdown,
        subtotal: parseFloat(subtotal.toFixed(2)),
        discount: parseFloat(discountAmount.toFixed(2)),
        tax: parseFloat(taxAmount.toFixed(2)),
        taxRate: taxRate * 100,
        total: parseFloat(finalAmount.toFixed(2)),
      },
      ...(promoDetails && { promo: promoDetails }),
      currency: 'INR',
    })
  } catch (error) {
    console.error('Calculate pricing error:', error)
    return errorResponse('Failed to calculate pricing', 500)
  }
}
