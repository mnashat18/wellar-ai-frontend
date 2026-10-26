/*
 * Isolated Wellar Web protocol-level workload. This is not a browser test.
 * No default target is supplied; all safety gates must be set explicitly.
 * Read-only business journeys except authentication and optional workspace
 * context switching. Use disposable staging accounts and synthetic fixtures.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const target = (__ENV.K6_TARGET_ORIGIN || '').trim();
const allowlistedHost = (__ENV.K6_ALLOWED_HOST || '').trim().toLowerCase();
const hostConfirmed = (__ENV.K6_TARGET_ISOLATED || '').trim();
const authorization = (__ENV.K6_RUN_AUTHORIZED || '').trim();
const email = (__ENV.K6_TEST_ACCOUNT_EMAIL || '').trim();
const password = __ENV.K6_TEST_ACCOUNT_PASSWORD || '';
const workspaceId = (__ENV.K6_SYNTHETIC_WORKSPACE_ID || '').trim();
const maxVus = Number(__ENV.K6_MAX_VUS || 0);
const vus = Number(__ENV.K6_VUS || 0);
const ramp = (__ENV.K6_RAMP || '').trim();
const steady = (__ENV.K6_STEADY || '').trim();
const scenario = (__ENV.K6_SCENARIO || 'steady').trim().toLowerCase();

function failClosed(reason) {
  throw new Error(`LOAD TEST SAFETY GATE: ${reason}`);
}

if (!target || !allowlistedHost || hostConfirmed !== 'YES' || authorization !== 'YES') {
  failClosed('Set target origin, exact allowlisted host, K6_TARGET_ISOLATED=YES, and K6_RUN_AUTHORIZED=YES.');
}
let parsedTarget;
try {
  parsedTarget = new URL(target);
} catch (_) {
  failClosed('K6_TARGET_ORIGIN must be an absolute origin.');
}
if (!['http:', 'https:'].includes(parsedTarget.protocol) || parsedTarget.pathname !== '/' || parsedTarget.search || parsedTarget.hash) {
  failClosed('Target must be an HTTP(S) origin only, with no path, query, or fragment.');
}
const hostname = parsedTarget.hostname.toLowerCase();
if (hostname !== allowlistedHost) failClosed('Target hostname must exactly match K6_ALLOWED_HOST.');
if (hostname === 'dash.conntinuity.com' || hostname === 'conntinuity.com' || hostname.endsWith('.conntinuity.com')) {
  failClosed('Wellar production API/site hostnames are prohibited.');
}
if (!email || !password || !workspaceId) failClosed('Synthetic test account and workspace fixture values are required.');
if (!Number.isInteger(vus) || !Number.isInteger(maxVus) || vus < 1 || maxVus < 1 || vus > maxVus) {
  failClosed('K6_VUS and K6_MAX_VUS must be positive integers, and VUS must not exceed the caller safety ceiling.');
}
if (maxVus > 2000) failClosed('Safety ceiling cannot exceed 2,000 VUs.');
if (!ramp || !steady) failClosed('Explicit K6_RAMP and K6_STEADY durations are required.');
if (!['steady', 'burst'].includes(scenario)) failClosed('K6_SCENARIO must be steady or burst.');

const errors = new Counter('endpoint_errors');
const endpointLatency = new Trend('endpoint_latency', true);
const navigationCriticalPath = new Trend('navigation_critical_path', true);
let journeyFinished = false;

export const options = {
  scenarios: {
    wellar_users: scenario === 'steady'
      ? {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: ramp, target: vus },
            { duration: steady, target: vus },
            { duration: '30s', target: 0 },
          ],
          gracefulRampDown: '30s',
        }
      : {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '15s', target: vus },
            { duration: '45s', target: vus },
            { duration: '30s', target: 0 },
          ],
          gracefulRampDown: '15s',
        },
  },
  summaryTrendStats: ['min', 'med', 'avg', 'p(90)', 'p(95)', 'p(99)', 'max'],
  noConnectionReuse: false,
  userAgent: 'Wellar-Staging-Load-Verification/1.0',
};

const api = (path) => `${target}${path}`;
const jsonHeaders = { headers: { 'Content-Type': 'application/json' }, tags: { page: 'auth', endpoint: 'auth_login' } };

function record(name, response, expectedStatuses) {
  endpointLatency.add(response.timings.duration, { endpoint: name });
  const ok = check(response, {
    [`${name}: expected status`]: (r) => expectedStatuses.includes(r.status),
  });
  if (!ok) errors.add(1, { endpoint: name, status: String(response.status) });
  return ok;
}

function get(name, path, page) {
  const response = http.get(api(path), {
    tags: { page, endpoint: name },
    timeout: '20s',
  });
  record(name, response, [200]);
  return response;
}

export default function () {
  if (journeyFinished) {
    sleep(30);
    return;
  }
  // One login per VU lifecycle. Do not loop credentials or perform brute-force tests.
  const loginStarted = Date.now();
  const login = http.post(api('/auth/login'), JSON.stringify({
    email,
    password,
    mode: 'session',
  }), jsonHeaders);
  if (!record('auth_login', login, [200])) {
    journeyFinished = true;
    sleep(30);
    return;
  }
  check(login, { 'auth response is JSON': (r) => (r.headers['Content-Type'] || '').includes('json') });

  // Session restoration and workspace context mimic authenticated Angular guards.
  sleep(1 + Math.random() * 2);
  const me = get('users_me', '/users/me?fields=id,email,first_name,last_name', 'session');
  if (me.status !== 200) return;
  const context = get('workspace_context', '/wellar/workspaces/context', 'session');
  if (context.status !== 200) return;

  // Dashboard fan-out: a deliberately small representative set of collection
  // reads; adjust collections/filters to match the approved synthetic tenant.
  sleep(1 + Math.random() * 3);
  const started = Date.now();
  get('dashboard_business_profile', `/items/business_profiles?filter[id][_eq]=${encodeURIComponent(workspaceId)}&fields=id,name,is_active&limit=1`, 'dashboard');
  get('dashboard_departments', `/items/departments?filter[business_profile][_eq]=${encodeURIComponent(workspaceId)}&fields=id,name&limit=100`, 'dashboard');
  get('workforce_roster', '/wellar/workforce', 'workforce');
  get('notifications', `/items/notifications?filter[business_profile][_eq]=${encodeURIComponent(workspaceId)}&sort=-date_created&limit=30&fields=id,status,date_created`, 'notifications');
  navigationCriticalPath.add(Date.now() - started, { page: 'dashboard_api_critical_path' });

  // A realistic read-only navigation sample; request collection uses the
  // current browser service's explicit limit=50 behavior. No record writes.
  sleep(2 + Math.random() * 4);
  get('scan_requests_list', `/items/requests?filter[business_profile][_eq]=${encodeURIComponent(workspaceId)}&sort=-timestamp&limit=50&fields=id,status,timestamp`, 'requests');

  sleep(2 + Math.random() * 4);
  get('activity_history', `/items/activity_events?filter[business_profile][_eq]=${encodeURIComponent(workspaceId)}&sort=-timestamp&limit=50&fields=id,event,timestamp`, 'history');

  // Reports/analytics sample is a bounded read. The exact deployed collection
  // and allowed field/filter contract must be confirmed before execution.
  sleep(2 + Math.random() * 5);
  get('reports_bounded_sample', `/items/reports_exports?filter[business_profile][_eq]=${encodeURIComponent(workspaceId)}&sort=-date_created&limit=25&fields=id,status,date_created`, 'reports');

  // No automatic VU iteration loop: users perform this journey once per VU.
  // Longer steady occupancy is modeled by VUs holding open browser-like think
  // time only when explicitly requested; protocol sessions otherwise end here.
  const elapsed = Date.now() - loginStarted;
  if (elapsed < 30000) sleep((30000 - elapsed) / 1000);
  journeyFinished = true;
}

export function handleSummary(data) {
  return {
    'stdout': JSON.stringify({
      note: 'Protocol-level API workload; not browser rendering or time-to-usable-dashboard.',
      target: `${parsedTarget.origin}`,
      scenario,
      configuredVus: vus,
      metrics: data.metrics,
    }, null, 2),
  };
}
