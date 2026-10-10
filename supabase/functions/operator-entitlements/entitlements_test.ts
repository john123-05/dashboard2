// Keine echten Datenbankzugriffe: jede HTTP-Anfrage wird vor dem Import abgefangen.
Deno.env.set('SUPABASE_URL', 'https://shared.invalid');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-only-placeholder');
Deno.env.set('OPERATOR_SUPABASE_URL', 'https://operator.invalid');
Deno.env.set('OPERATOR_SUPABASE_ANON_KEY', 'test-only-placeholder');

const PARK = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
let mode = 'row';
let writes: Record<string, unknown>[] = [];
let entitlementReads = 0;
const row = { park_id: PARK, plan: 'marketing_pro', features: ['online_shop'], status: 'active', trial_until: null };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
});
function assert(value: unknown, message = 'Assertion failed'): void {
  if (!value) throw new Error(message);
}

globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const token = new Headers(init?.headers).get('Authorization');
  if (url.pathname === '/auth/v1/user') {
    const valid = url.hostname === 'operator.invalid' ? token === 'Bearer operator' : token === 'Bearer staff';
    return Promise.resolve(valid
      ? response({ id: USER, app_metadata: { allowed_park_ids: [PARK] }, aud: 'authenticated', role: 'authenticated' })
      : response({ message: 'Invalid token' }, 401));
  }
  if (url.pathname === '/rest/v1/admin_users') {
    return Promise.resolve(response(mode === 'not-admin' ? null : { user_id: USER }));
  }
  if (url.pathname === '/rest/v1/parks') {
    const own = url.searchParams.get('id') === `eq.${PARK}`;
    if (url.hostname === 'operator.invalid') return Promise.resolve(response(own && mode !== 'denied' ? [{ id: PARK }] : []));
    return Promise.resolve(response(own ? { id: PARK } : null));
  }
  if (url.pathname === '/rest/v1/park_entitlements') {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      return Promise.resolve(response(body));
    }
    entitlementReads++;
    assert(url.searchParams.get('park_id') === `eq.${PARK}`, 'Read must be scoped to authorized park');
    assert(!url.searchParams.get('select')?.includes('stripe_subscription_id') || token === 'Bearer test-only-placeholder');
    if (mode === 'missing-table') return Promise.resolve(response({ code: 'PGRST205' }, 404));
    if (mode === 'db-error') return Promise.resolve(response({ code: '42501' }, 403));
    return Promise.resolve(response(mode === 'missing-row' ? null : row));
  }
  throw new Error(`Unexpected request: ${url}`);
};
const { handler: operator } = await import('./index.ts');
const { handler: admin } = await import('../admin-park-entitlements/index.ts');
function get(token = 'operator', park = PARK) {
  return new Request(`https://edge.invalid/?park_id=${park}`, { headers: { Authorization: `Bearer ${token}` } });
}
function post(body: unknown, token = 'staff') {
  return new Request('https://edge.invalid/', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}

Deno.test('Operator: Auth, Park-Trennung, fehlende Zeile und Fehler', async () => {
  assert((await operator(new Request(`https://edge.invalid/?park_id=${PARK}`))).status === 401);
  const before = entitlementReads;
  assert((await operator(get('operator', OTHER))).status === 403);
  assert(entitlementReads === before, 'Foreign park must not reach entitlements');
  mode = 'denied';
  assert((await operator(get())).status === 403);
  mode = 'row';
  const result = await (await operator(get())).json();
  assert(result.data.plan === 'marketing_pro');
  mode = 'missing-row';
  assert((await (await operator(get())).json()).data === null);
  mode = 'missing-table';
  assert((await (await operator(get())).json()).migration_pending === true);
  mode = 'db-error';
  assert((await operator(get())).status === 503, 'DB failure must never grant Starter');
  mode = 'row';
  assert((await operator(post(row))).status === 405);
});

Deno.test('Staff: nur Admins, gültige Eingaben, kein Stripe-Schreiben', async () => {
  writes = [];
  assert((await admin(post(row, 'operator'))).status === 401);
  mode = 'not-admin';
  assert((await admin(post(row))).status === 403);
  mode = 'row';
  for (const invalid of [
    null, [], { ...row, plan: 'unlimited' }, { ...row, features: ['unknown'] },
    { ...row, features: [null] }, { ...row, status: 'trial', trial_until: null },
    { ...row, status: 'trial', trial_until: '2026-02-30' },
    { ...row, source: 'stripe' }, { ...row, stripe_subscription_id: 'sub_fake' },
  ]) assert((await admin(post(invalid))).status === 400);
  assert(writes.length === 0, 'Invalid input must not write');
  assert((await admin(post({ ...row, park_id: OTHER }))).status === 404);
  assert((await admin(post({ ...row, features: ['speed', 'speed'] }))).status === 200);
  assert(writes.length === 1);
  assert(writes[0].source === 'manual');
  assert(JSON.stringify(writes[0].features) === '["speed"]');
  assert(!('stripe_subscription_id' in writes[0]), 'Preserve existing Stripe reference');
});
