// lib/phone-privacy.ts
//
// Keeping real phone numbers off the wire.
//
// Two pairs never see each other's numbers: customer ↔ delivery partner, and
// customer ↔ laundry provider. They reach each other through a bridged call
// instead (lib/telephony). The delivery partner ↔ provider pair is deliberately
// untouched — both are business parties who deal with each other repeatedly.
//
// Internal staff (admin, support) keep every real number. An agent resolving a
// dispute has to be able to actually phone people.
//
// WHY THIS EXISTS AS A HELPER, not just a few deleted SELECT columns:
// customer_addresses.contact_phone is snapshotted into orders.pickup_address
// and orders.delivery_address as JSON. So a route can drop `customer_phone`
// from its response and still be handing the partner the customer's number,
// buried in the address blob it needs for navigation. That blob has to be
// scrubbed too, and it is easy to forget — hence one function, called at every
// surface that ships an address to a masked counterparty.

/**
 * Is masking switched on right now?
 *
 * Hiding a number is only safe once there is another way to place the call.
 * Scrubbing unconditionally would mean that between deploying this and
 * finishing the telephony provider's onboarding, a partner at a customer's
 * door has no number AND no working call button — worse than either state on
 * its own. So the scrub follows the same switch the call routes do, and the
 * two can never be out of step.
 *
 * Note this governs the two MASKED PAIRS only. Provider numbers stayed off
 * the public discovery pages for a different reason — a published shop number
 * invites off-platform booking — and that removal is unconditional.
 */
export async function shouldMaskPhones(): Promise<boolean> {
  const { loadCallConfig } = await import('@/lib/telephony')
  const config = await loadCallConfig().catch(() => null)
  return config?.is_active === true
}

/**
 * Remove contact phone numbers from an order address, preserving whatever
 * shape came in.
 *
 * pickup_address / delivery_address are TEXT columns holding *either* a
 * serialized address object (customer checkout writes these) or flat text
 * (older rows and some admin paths). Different routes hand the value onward
 * differently too — the delivery API returns the raw string for fmtAddr(),
 * the customer API parses it to an object first. Changing the shape here
 * would break one caller or the other, so a string in yields a string out and
 * an object in yields an object out.
 *
 * contact_name is deliberately kept. The partner still needs to know who to
 * ask for at the door; it is the number that has to go.
 */
export function scrubAddressContact<T>(address: T): T {
  if (address == null) return address

  if (typeof address === 'string') {
    // Flat text address — no structured phone field to strip.
    if (!/^\s*[{[]/.test(address)) return address
    try {
      const parsed = JSON.parse(address)
      return JSON.stringify(stripPhoneKeys(parsed)) as unknown as T
    } catch {
      // Looked like JSON but isn't. Nothing structured to remove.
      return address
    }
  }

  if (typeof address === 'object') {
    return stripPhoneKeys(address) as unknown as T
  }

  return address
}

/**
 * Both spellings are removed. `contact_phone` is what customer_addresses
 * writes today, but older snapshots and admin-entered addresses have been seen
 * carrying a bare `phone`, and a leak through the legacy key would be just as
 * real as one through the current key.
 */
function stripPhoneKeys(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(stripPhoneKeys)

  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) }
  delete clone.contact_phone
  delete clone.contactPhone
  delete clone.phone
  return clone
}

/**
 * Drop named keys from a row before it leaves the API.
 *
 * Used where a phone column is easier to remove after the query than to unpick
 * from a large SELECT — and it keeps the removal greppable, so the reason is
 * visible at the call site rather than being an absence nobody notices.
 */
export function omitKeys<T extends Record<string, unknown>, K extends string>(
  row: T,
  keys: readonly K[]
): Omit<T, K> {
  const clone = { ...row }
  for (const key of keys) delete clone[key as unknown as keyof T]
  return clone as Omit<T, K>
}
