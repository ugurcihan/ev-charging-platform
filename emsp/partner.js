// Simulates a roaming partner (an eMSP — e-Mobility Service Provider app)
// registering with the platform's OCPI interface and pulling Locations,
// Sessions and CDRs — the real OCPI 2.2.1 handshake.
// Usage: node emsp/partner.js [platformBaseUrl] [tokenA]

const BASE = process.argv[2] || `http://localhost:${process.env.PORT || 9230}`;
const TOKEN_A = process.argv[3] || process.env.TOKEN_A;

const EMSP_PARTY = { role: 'EMSP', business_details: { name: 'Partner Mobility App' }, party_id: 'PMA', country_code: 'TR' };
const MY_TOKEN_B = `tokenB-${Math.random().toString(16).slice(2)}`;

async function main() {
  if (!TOKEN_A) {
    console.error('Usage: node emsp/partner.js [platformBaseUrl] <tokenA>');
    console.error('(Token A is printed by the server on startup)');
    process.exit(1);
  }

  const OCPI_BASE = `${BASE}/ocpi`;
  console.log(`[Partner] discovering versions at ${OCPI_BASE}/versions`);
  const versions = await get(`${OCPI_BASE}/versions`, TOKEN_A);
  const v221 = versions.data.find((v) => v.version === '2.2.1');
  console.log('[Partner] -> found 2.2.1 at', v221.url);

  const details = await get(v221.url, TOKEN_A);
  console.log('[Partner] -> module endpoints:', details.data.endpoints.map((e) => e.identifier).join(', '));

  const credEndpoint = details.data.endpoints.find((e) => e.identifier === 'credentials').url;
  console.log(`[Partner] registering (POST ${credEndpoint}) with our Token B + party info`);
  const reg = await post(credEndpoint, TOKEN_A, { token: MY_TOKEN_B, url: `${BASE}/emsp/versions`, roles: [EMSP_PARTY] });
  const TOKEN_C = reg.data.token;
  console.log(`[Partner] <- registered. Platform is "${reg.data.roles[0].business_details.name}", issued Token C`);

  console.log('\n[Partner] pulling Locations…');
  const locations = await get(details.data.endpoints.find((e) => e.identifier === 'locations').url, TOKEN_C);
  locations.data.forEach((l) => console.log(`  - ${l.id}: ${l.name} (${l.evses.length} EVSE)`));

  console.log('\n[Partner] pulling CDRs (settlement records)…');
  const cdrs = await get(details.data.endpoints.find((e) => e.identifier === 'cdrs').url, TOKEN_C);
  if (!cdrs.data.length) {
    console.log('  (none yet — POST /ocpi/simulate-session on the server to generate one)');
  } else {
    cdrs.data.forEach((c) => console.log(`  - ${c.id}: ${c.total_energy} kWh, ${c.total_cost.incl_vat} ${c.currency} (incl. VAT)`));
  }

  console.log('\n[Partner] roaming session complete.');
}

async function get(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function post(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
  return res.json();
}

main().catch((err) => {
  console.error('[Partner] error:', err.message);
  process.exit(1);
});
