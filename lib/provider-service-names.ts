// lib/provider-service-names.ts
//
// The list of services a provider actually offers, for the provider cards.
//
// ---- What was wrong --------------------------------------------------------
// Cards read `laundry_profiles.services_offered`, a text[] on the profile row.
// Nothing in the application maintains it: the only writer left is one legacy
// profile route, so it holds whatever happened to be captured at that moment
// and is empty for every provider onboarded since.
//
// The visible result was a card listing four services for one provider and
// nothing at all for the others — and even that provider's four did not match
// its real catalogue.
//
// ---- Where the truth lives -------------------------------------------------
// `provider_services` (provider_id, service_id) is the table the catalogue,
// the pricing matrix and order-create all read. A row there means the provider
// offers that service, so it is the same answer the customer gets on the next
// screen.
//
// `services.is_active` is honoured so a service the platform has retired is
// not still advertised.

/**
 * A correlated scalar subquery yielding TEXT[] of service names, aliased
 * `services_offered` so existing response mapping keeps working.
 *
 * `alias` is the table alias for laundry_profiles in the surrounding query.
 */
export function providerServiceNamesSql(alias = 'lp'): string {
  return `COALESCE((
             SELECT ARRAY_AGG(DISTINCT s.name ORDER BY s.name)
             FROM provider_services ps
             JOIN services s ON s.id = ps.service_id
             WHERE ps.provider_id = ${alias}.id
               AND s.is_active = TRUE
           ), ARRAY[]::TEXT[]) AS services_offered`
}
