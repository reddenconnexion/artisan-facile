import fs from 'node:fs/promises';
import path from 'node:path';

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars.');
  process.exit(1);
}

async function fetchCounts() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_intervention_counts_by_city`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    },
  );
  if (!res.ok) {
    throw new Error(`Supabase RPC failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function geocode(postalCode, city) {
  const params = new URLSearchParams({
    nom: city,
    fields: 'nom,code,centre',
    limit: '1',
  });
  if (postalCode) params.set('codePostal', postalCode);
  const res = await fetch(`https://geo.api.gouv.fr/communes?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.length || !data[0].centre) return null;
  return {
    name: data[0].nom,
    inseeCode: data[0].code,
    lat: data[0].centre.coordinates[1],
    lng: data[0].centre.coordinates[0],
  };
}

async function main() {
  const rows = await fetchCounts();
  const cities = [];

  for (const row of rows) {
    const geo = await geocode(row.postal_code, row.city);
    if (!geo) {
      console.warn(`No geocode for ${row.city} (${row.postal_code ?? '—'})`);
      continue;
    }
    cities.push({
      city: geo.name,
      inseeCode: geo.inseeCode,
      postalCode: row.postal_code,
      count: Number(row.count),
      lat: geo.lat,
      lng: geo.lng,
    });
    await new Promise((r) => setTimeout(r, 100));
  }

  const total = cities.reduce((s, c) => s + c.count, 0);
  const output = {
    generatedAt: new Date().toISOString(),
    total,
    cities,
  };

  const outPath = path.resolve('js/interventions.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${cities.length} cities (total ${total}) to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
