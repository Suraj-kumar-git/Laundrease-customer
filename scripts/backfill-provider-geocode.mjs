// One-time backfill: geocode existing laundry_profiles rows that are missing
// latitude/longitude, using the Google Maps Geocoding API.
//
// Run with: node scripts/backfill-provider-geocode.mjs

import { Client } from "pg";
import "dotenv/config";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const REQUEST_DELAY_MS = 200; // stay well under Google's rate limits

// Coarse city-centroid fallback — used only when the Google Geocoding API
// is unavailable/denied or returns no match. Good enough for city-level
// "providers near you" sorting on dummy/placeholder test addresses; once
// real geocoding works, re-run with these rows nulled out for accuracy.
const CITY_CENTROID_FALLBACK = [
  { match: /pimpri|pimpor/i,     lat: 18.6298, lng: 73.7997 },
  { match: /mumbai|bombay/i,     lat: 19.0760, lng: 72.8777 },
  { match: /pune/i,              lat: 18.5204, lng: 73.8567 },
  { match: /muzaffarpur/i,       lat: 26.1209, lng: 85.3647 },
  { match: /bhopal/i,            lat: 23.2599, lng: 77.4126 },
];

function cityCentroidFallback(city) {
  if (!city) return null;
  const hit = CITY_CENTROID_FALLBACK.find((c) => c.match.test(city));
  return hit ? { latitude: hit.lat, longitude: hit.lng } : null;
}

async function geocodeAddress(parts) {
  const address = parts.filter(Boolean).join(", ");
  if (!address) return null;

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  const json = await res.json();

  if (json.status !== "OK" || !json.results?.length) {
    console.warn(`  -> no geocode result (${json.status}) for: ${address}`);
    return null;
  }

  const { lat, lng } = json.results[0].geometry.location;
  return { latitude: lat, longitude: lng };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error("GOOGLE_MAPS_API_KEY is not set in the environment.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT id, address_line1, address_line2, city, state, postal_code
      FROM laundry_profiles
      WHERE (latitude IS NULL OR longitude IS NULL)
        AND city IS NOT NULL
        AND postal_code IS NOT NULL
    `);

    console.log(`Found ${rows.length} provider(s) missing coordinates.`);

    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      console.log(`Geocoding provider ${row.id} (${row.city})...`);
      let geo = await geocodeAddress([
        row.address_line1,
        row.address_line2,
        row.city,
        row.state,
        row.postal_code,
        "India",
      ]);
      let source = "google";

      if (!geo) {
        geo = cityCentroidFallback(row.city);
        source = "city_centroid_fallback";
      }

      if (geo) {
        await client.query(
          `UPDATE laundry_profiles SET latitude = $2, longitude = $3, updated_at = NOW() WHERE id = $1`,
          [row.id, geo.latitude, geo.longitude]
        );
        updated++;
        console.log(`  -> set (${geo.latitude}, ${geo.longitude}) via ${source}`);
      } else {
        skipped++;
      }

      await sleep(REQUEST_DELAY_MS);
    }

    console.log(`Done. Updated: ${updated}, skipped (no match): ${skipped}.`);
  } finally {
    await client.end();
  }
}

await run();
