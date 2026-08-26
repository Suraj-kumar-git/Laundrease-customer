// lib/gst-state.ts
//
// Checking that a GSTIN belongs to the state it claims to operate in.
//
// GST registration in India is STATE-WISE: one legal entity trading in
// Maharashtra and Delhi holds two separate GSTINs, not one. The first two
// digits of a GSTIN are the state code, so a registration and a place of
// business can be checked against each other rather than taken on trust.
//
// This matters because the invoice is assembled from the branch row — its
// address, its state, its GSTIN (lib/order-invoice.ts). A branch that inherited
// its parent's out-of-state GSTIN would issue invoices whose state code
// contradicts their own address: not a valid tax invoice, no input tax credit
// for a registered customer, and the CGST+SGST vs IGST split decided from the
// wrong state.
//
// So a branch's GSTIN is validated against the branch's own state, not merely
// against the GSTIN format.

/** GST state codes (first two digits of a GSTIN). */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
}

export const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

/** The state a GSTIN is registered in, or null if the code is not a real one. */
export function gstStateFor(gstin: string): string | null {
  const code = gstin.trim().slice(0, 2)
  return GST_STATE_CODES[code] ?? null
}

/**
 * Normalise a state name for comparison.
 *
 * Providers type "Maharashtra", "MAHARASHTRA", "Maharashtra " and occasionally
 * "Orissa" for Odisha. Comparing raw strings would reject valid entries and
 * teach people to work around the check.
 */
const STATE_ALIASES: Record<string, string> = {
  orissa:            'odisha',
  pondicherry:       'puducherry',
  uttaranchal:       'uttarakhand',
  'nct of delhi':    'delhi',
  'new delhi':       'delhi',
  'delhi ncr':       'delhi',
}

function normaliseState(name: string): string {
  const base = name.trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ')
  return STATE_ALIASES[base] ?? base
}

export type GstStateCheck =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Does this GSTIN belong to this state?
 *
 * Returns ok when the state cannot be determined from either side rather than
 * guessing — an unrecognised state name is a data-quality problem, not grounds
 * to block a provider from trading.
 */
export function checkGstMatchesState(gstin: string, stateName: string | null | undefined): GstStateCheck {
  if (!GST_REGEX.test(gstin.trim().toUpperCase())) {
    return { ok: false, error: 'Enter a valid GST number (e.g. 27AAAAA0000A1Z5)' }
  }

  const gstState = gstStateFor(gstin)
  if (!gstState) {
    return { ok: false, error: `"${gstin.slice(0, 2)}" is not a valid GST state code` }
  }
  if (!stateName?.trim()) return { ok: true }

  if (normaliseState(gstState) !== normaliseState(stateName)) {
    return {
      ok: false,
      error:
        `This GSTIN is registered in ${gstState}, but the branch is in ${stateName.trim()}. ` +
        `GST registration is state-wise — this branch needs its own ${stateName.trim()} GSTIN.`,
    }
  }
  return { ok: true }
}
