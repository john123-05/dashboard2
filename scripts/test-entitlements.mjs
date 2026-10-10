// Isoliert Planlogik und Hook mit kontrolliertem Netz/React-Lebenszyklus, ohne Browserkonto.
// Ausführen: node scripts/test-entitlements.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const slots = [];
let cursor = 0;
let effects = [];
let parkId = 'park-a';
let sessionKey = 'session-a';
let requests = [];
const react = {
  useContext: () => ({ session: { access_token: sessionKey } }),
  useState(initial) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = initial;
    return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
  },
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useEffect(fn, deps) {
    const i = cursor++;
    const previous = slots[i];
    if (!previous || deps.some((v, j) => v !== previous.deps[j])) {
      previous?.cleanup?.();
      effects.push(() => { slots[i] = { deps, cleanup: fn() }; });
    }
  },
};
const context = {
  exports: {}, Intl, Date, URLSearchParams, AbortSignal, Promise,
  window: { setInterval: () => 1, clearInterval: () => {} },
  document: { addEventListener: () => {}, removeEventListener: () => {} },
  fetch: (url) => new Promise((resolve) => { requests.push({ url, resolve }); }),
  require: (name) => {
    if (name === 'react') return react;
    if (name.includes('AuthContext')) return { AuthContext: {} };
    if (name.includes('ParkContext')) return { usePark: () => ({ parkId }) };
    if (name.includes('GuestActivityAwareOverlay')) return { hasGuestActivity: (id) => id === 'speed-park' };
    if (name === './supabase') return { EXTERNAL_SUPABASE_URL: 'https://shared.invalid' };
    if (name === './functionAuth') return { getFunctionSession: async () => ({ data: { session: { access_token: sessionKey } } }) };
    throw new Error(name);
  },
};
const source = readFileSync(new URL('../src/lib/plans.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { resolveEntitlements: resolve, planIncludes, useEntitlements } = context.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));
const row = (overrides = {}) => ({ park_id: parkId, plan: 'marketing_pro', features: ['online_shop'], status: 'active', trial_until: null, ...overrides });
assert.deepEqual(plain(resolve(null, 'park-a')), { plan: 'marketing_starter', features: [] });
assert.deepEqual(plain(resolve(null, 'speed-park')), { plan: 'marketing_starter', features: ['speed'] });
assert.equal(resolve(row({ plan: 'basis' }), 'speed-park').plan, 'basis');
for (const status of ['paused', 'cancelled']) assert.deepEqual(plain(resolve(row({ status }), parkId)), { plan: 'basis', features: [] });
const trial = row({ status: 'trial', trial_until: '2026-10-10' });
assert.equal(resolve(trial, parkId, new Date('2026-10-10T21:59:59Z')).plan, 'marketing_pro');
assert.equal(resolve(trial, parkId, new Date('2026-10-10T22:00:00Z')).plan, 'basis');
assert.equal(planIncludes('basis', 'crm_contacts'), false);
assert.equal(planIncludes('marketing_starter', 'crm_contacts'), true);
assert.equal(planIncludes('marketing_starter', 'reports_pro'), false);
assert.equal(planIncludes('marketing_pro', 'reports_pro'), true);
assert.equal(planIncludes('marketing_pro', 'online_shop'), false);

function render() { cursor = 0; const value = useEntitlements(); effects.splice(0).forEach((fn) => fn()); return value; }
const tick = () => new Promise((r) => setImmediate(r));
function respond(request, data, ok = true) { request.resolve({ ok, status: ok ? 200 : 503, json: async () => ({ data }) }); }
assert.equal(render().loading, true);
await tick();
parkId = 'park-b';
assert.equal(render().has('crm_contacts'), false);
await tick();
respond(requests[0], row({ park_id: 'park-a' }));
await tick();
assert.equal(render().loading, true, 'Late response must not leak across parks');
respond(requests[1], row({ plan: 'basis', features: ['speed'] }));
await tick();
assert.equal(render().plan, 'basis');
assert.equal(render().has('speed'), true);
assert.equal(render().has('crm_contacts'), false);
render().refresh(); render(); await tick();
respond(requests[2], null, false); await tick();
assert.equal(render().error, true);
assert.equal(render().has('speed'), false, 'Failure must not activate fallback');
render().refresh(); render(); await tick();
respond(requests[3], null); await tick();
assert.equal(render().plan, 'marketing_starter');
sessionKey = 'session-b';
assert.equal(render().loading, true, 'Another session must not inherit plan');
await tick(); respond(requests[4], row({ park_id: 'park-a' })); await tick();
assert.equal(render().error, true, 'Foreign response must be rejected');
console.log('Planlogik, Testablauf, Park-/Sitzungswechsel, Netzfehler und Wiederholen: OK');
