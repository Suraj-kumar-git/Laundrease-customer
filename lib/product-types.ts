// lib/product-types.ts
// Per-kg services (wash & fold, wash & iron) aren't tied to a single garment
// type, but cart_items/order_items.product_type_id is a NOT NULL FK into
// product_types. "Regular Laundry (Mixed)" (seeded in
// scripts/09-pricing-quickpickup.sql, pricing_model='per_kg') is the
// catch-all row used for these — resolved by pricing_model rather than a
// hardcoded id, since SERIAL ids aren't stable across environments.

interface QueryableClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: number }> }>
}

export async function getMixedLoadProductTypeId(client: QueryableClient): Promise<number> {
  const result = await client.query(
    `SELECT id FROM product_types WHERE pricing_model = 'per_kg' ORDER BY sort_order ASC LIMIT 1`
  )
  const id = result.rows[0]?.id
  if (!id) {
    throw new Error("No per_kg product type found — expected a 'Regular Laundry (Mixed)' row in product_types")
  }
  return id
}
