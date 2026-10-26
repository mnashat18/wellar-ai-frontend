# Wellar Web: 2,000 User Load Readiness

**Assessment date:** 2026-10-15  
**Repository:** `D:\flutter\wellar-pro`  
**Decision:** **NOT TESTED — 2,000 concurrent users have not been tested or passed.** No isolated staging environment, test credentials, synthetic fixtures, resource limits, or cleanup procedure were verifiable in this checkout. No traffic was sent to any host.  
**Architecture boundary:** Wellar Web uses Directus and Wellar-specific APIs. No Wellar AI V2 integration is assumed or proposed.

## 1. Verified Web Architecture

The application is Angular 21 with standalone components, TypeScript 5.9, RxJS 7.8, Angular Router and `HttpClient`. It is built as a static SPA and deployed by the checked-in Node 20/Nginx multi-stage Dockerfile. `src/app/app.routes.ts` defines public, authenticated, mobile legacy, and parameter/query-driven flows; operational page components are mostly lazy loaded. The web API origin configured in `src/environments/environment.ts`, `.development.ts`, and `.prod.ts` is `https://dash.conntinuity.com`. The dev proxy uses the same host.

`AuthService` uses Directus session login (`POST /auth/login`, mode `session`), then fetches `/users/me`. `AuthInterceptor` attaches credentials to the configured API origin and removes any `Authorization` header. Workspace context comes from `/wellar/workspaces/context`; switching sends a membership ID to `/wellar/workspaces/switch`. Services also read Directus `/items/{collection}` endpoints and call custom `/wellar/*` endpoints. The repository contains a Directus workspace extension, but does not prove that it is installed in a separate staging Directus instance.

Important source references:

- Routes and route guards: `src/app/app.routes.ts` (`routes`, `appAuthGuard`, `dashboardWorkspaceGuard`, `employeeWebOperationalGuard`, `activeRoleRouteGuard`).
- Bootstrap/providers: `src/main.ts`, `src/app/app.ts`, `src/app/app.config.ts`.
- Authentication/interceptor: `src/app/services/auth.ts`, `src/app/services/auth.interceptor.ts`.
- Workspace verification/switch: `src/app/services/workspace-context-api.service.ts`, `src/app/core/context/company-context.service.ts`.
- Operational dashboard: `src/app/Pages/dashboard/dashboard.ts`, `src/app/services/operational-dashboard.service.ts`.
- Reports: `src/app/Pages/reports/reports.ts`, `src/app/services/reports.service.ts`.
- Heartbeat: `src/app/core/presence/presence-heartbeat.service.ts`.
- Deployment/config: `angular.json`, `Dockerfile`, `nginx.conf`, `proxy.conf.json`, `src/environments/*`.

Source establishes request construction and client behavior, not live API success, deployed permissions, database capacity, or browser rendering speed.

## 2. Traffic Model

“2,000 concurrent users” means 2,000 active user sessions open during an interval. It does **not** mean 2,000 requests/second. Request rate depends on each user's page mix, think time, retries, polling and duration. At a 60-second cadence, one periodic request per session would average about 33 requests/second across 2,000 sessions; the app heartbeat is one such source while visible and authenticated. This arithmetic is a model, not a measured rate.

Browser-side work includes Angular boot and lazy chunk downloads, route matching, change detection, local filtering, chart rendering, data mapping, report calculations and PDF/CSV generation. Protocol-level API load does not measure those browser costs. Directus/backend/database work includes auth/session validation, workspace and role checks, collection filtering/sorting, response serialization, extensions, DB connections and query execution. These must be measured separately.

Traffic assumptions for a later test must be agreed from product analytics or representative observation. In their absence, the harness uses one synthetic journey per VU and 1–5 second randomized think pauses; it is not asserted to be a production usage distribution.

## 3. Critical Page and Endpoint Matrix

Only source-declared routes and observed service calls are included. Some endpoints are parallelized through `forkJoin`/promises, so total call fan-out can be greater than the number of navigations. Response size varies with tenant data. Query filters in browser code are not a substitute for server-side authorization.

| Journey (actual route) | Source-observed request sequence / endpoint templates | Data/backend dependency and client behavior | Load concern |
|---|---|---|---|
| Public landing `/` | Landing may call `POST /wellar/auth/email-availability` for email validation; login/signup modal invokes auth endpoints only after user action. | No general login polling. Availability has debounce/cache logic in `public.layout/authlanding/authlanding.ts`; API rate limiting is unknown. Static assets/chunks are browser/CDN work. | Landing itself is mostly static. Do not model credential retries as normal traffic. |
| Login/session restoration | `POST /auth/login` → `GET /users/me`; callback/guard restoration can `POST /auth/refresh` → `GET /users/me`; workspace guard/context then `GET /wellar/workspaces/context`. Google auth is top-level `/auth/login/google` redirect. | Session cookie; request credentials. `AuthInterceptor` has no retry or anonymous replay. `WorkspaceContextApiService` timeout is 10s. | Auth and guard requests serialize some navigation paths and can create a startup waterfall. Session expiry behavior requires staging validation. |
| Workspace switch | `POST /wellar/workspaces/switch` with `{membership_id}` → context state updated/reload; selected collection/page loads follow. | Only members visible to caller should be switchable; extension/server must enforce membership. Switch changes the test session's active context, not a fixture row. | Context refresh and destination page can duplicate reads; test with a disposable account having at least two memberships and restore/verify context. |
| Dashboard `/app/dashboard` | Guard: session/context calls; operational dashboard issues parallel reads including `GET /wellar/workforce`, `/items/departments` (limit 100), `/items/wellness_scans` (limit up to 300), `/items/alerts` (limit up to 80), request queue via workforce/custom route, `/items/scan_results`, and related sections. Exact fan-out depends on role and service path. | `OperationalDashboardService.getDashboardData` builds sections in parallel. Some sections cap limits and use workspace/department filters. `DashboardService` also has direct collection query helpers. | Directus DB fan-out, scans/results joins, permission filters and response payload. Large companies increase server and client transform/render work. Measure per section, not just route total. |
| Workforce `/app/workforce` | `GET /wellar/workforce` returns active context, departments, roster rows, eligible scan targets and request summary. Additional invite/member actions use `/wellar/workspaces/invites...` or collection endpoints. | `WorkforceRosterApiService` has a 12s timeout and parses a single composite payload. UI is role-sensitive. | Composite roster response can be large; server aggregation and row count determine cost. Pagination behavior is not exposed in this service response. |
| Scan requests `/app/scan-requests` | `RequestsPageComponent.loadPage()` combines `getRequestsPageData()` with modal options; service loads roster, departments and request/scan collections. Dynamic collection calls include `items/requests`, `items/wellness_scans`, and custom scan-request routes depending on method. Some service reads use limit 800. | `forkJoin` creates concurrent fan-out; request mutations are not part of read-only harness. Filters/scope and statuses are role-sensitive. | Multiple high-limit reads per visit; duplicate modal option loading possible when opening create modal. Need DB query/payload inspection. |
| History `/history` (mobile legacy route) | `DashboardService.getScanResultsAccessInfo()` then `getScanResults(50)`; current mobile route uses `/history` only when narrow + touch. Desktop `/history` redirects to `/app/dashboard`. | `GET /items/scan_results` and possible related scan data. | 50-row bounded screen; history semantics and actual calls are role/permission dependent. Do not treat legacy component as generally desktop reachable. |
| Reports `/app/reports` | `ReportsService.loadReports()` concurrently loads roster/members, departments, wellness scans, scan requests, alerts, then scan results for selected scan IDs. Source limits include departments 400, wellness scans 2,500, scan results 2,500, alerts 2,500; report date range defaults to last 30 days. | Several collection reads use filters and a shared client-side calculation/export flow. Export builds CSV/PDF in browser. | Highest observed data volume; scans/results can reach thousands of records per user, plus relationship joins and client allocations. Reports could dominate DB, API serialization, network and browser memory. |
| Alerts `/app/alerts` | Page data includes alert list/detail plus departments and workflow data. Directus `/items/alerts` and `/wellar/alerts...` templates appear in `OperationsWorkflowsService`. | Reloads on explicit UI action/workflow transitions; source page guards stale results using run IDs. No WebSocket detected. | Collection filtering and per-role scoping; potential repeated reloads after actions. No evidence of continuous alert polling. |
| Notifications (shell/panel) | `GET /items/notifications?...` (limit 30, fields metadata may be fetched first); `PATCH /items/notifications/:id` for update/read state. | `NotificationsService` listens to workspace/context state and reloads when that context changes. No WebSocket/SSE detected. | No fixed polling interval found in the inspected service. Schema fallback can retry reads after permission/field errors, increasing request count on incompatible schema. |
| Presence heartbeat | `PATCH /users/me` at startup and up to every 60s while visible/authenticated; focus/visibility events may trigger, with 20s minimum spacing, 15s timeout and exponential-ish capped backoff. | Exact implementation: `PresenceHeartbeatService`; one in-flight request; permanent permission/schema failures disable for session. | At 2,000 visible sessions, nominal steady cadence is ~33 pings/sec, plus startup/focus peaks. Measure DB write cost, pool, and focus/resume burst. |
| Compliance `/app/compliance` | Page fetches departments plus scans/results/consents using `ComplianceService` and/or workflow page-data service. Query helper accepts collection, filters, sort, limit. | Role-specific scoping and schema fallbacks; page filters may trigger further client-side filtering/refetch. | Source includes some broad requests with limits up to 800 in workflow paths; confirm actual routed service path and backend policy. |
| Company `/app/company` | `/wellar/organization`, `/wellar/organization/profile` PATCH, `/wellar/organization/departments` POST/PATCH plus Directus business profile/member/department reads. | Company tabs are query-driven; only owner/HR route guard. | CRUD traffic is low relative to list/report reads; do not issue writes in generic load test. |

### Frequency and fan-out notes

- Presence: nominal 60-second interval while visible, bootstrap ping immediately, focus/visibility event ping gated to 20 seconds, timeout 15 seconds and backoff on failures (`presence-heartbeat.service.ts`).
- Notifications: context-triggered loads, not a detected fixed polling loop (`notifications.service.ts`).
- Workspace context: guard and switch flows can call `/wellar/workspaces/context`; force refresh adds a timestamp cache-buster; endpoint timeout 10 seconds.
- Dashboard: parallel sections; limits include 100 departments, 300 scans, 80 alerts and roster/custom queue. Exact parallel request count depends on role and resolved service configuration.
- Requests: page data uses parallel composition and some collection limits reach 800; open-create modal can load options separately.
- Reports: limits up to 2,500 records in several collections, with scan results fetched after scan IDs are known. This is not fully unbounded, but is a large per-user cap and may multiply at concurrency.
- Pagination: bounded `limit` values are visible in the above flows; explicit user-driven server pagination was not established for composite workforce/dashboard/report payloads. The workforce endpoint returns a complete composite object with no client page parameter in its service call.
- Browser work: Angular rendering, charting and report/PDF calculations have not been benchmarked. HTTP timing cannot establish time-to-first-usable-dashboard.

## 4. Staging Environment Discovery

**Result: no isolated staging environment could be verified.** The checked-in environment files point at `https://dash.conntinuity.com`; the dev proxy also targets that origin. No separate stage API origin, staging compose stack, test credentials, synthetic tenant fixture manifest, Directus process config, safe cleanup procedure, or declared API/DB resource envelope was found in the inspected repository. No local k6, Locust, Artillery or Docker executable was found through the shell command discovery check.

This is not proof that infrastructure does not exist elsewhere. It means this checkout does not provide sufficient evidence/authorization to select or use it. `localhost` or a staging-like hostname is not considered disposable without explicit operator confirmation and isolation evidence. **No DNS lookup, connection attempt, health check, browser navigation, or API request was performed.**

`dash.conntinuity.com` and `conntinuity.com` are prohibited targets for this workload. No test used the configured production-looking origin.

## 5. Prepared Harness and Test Plan

An isolated k6 protocol harness is prepared at [performance/load/wellar-staging.k6.js](/D:/flutter/wellar-pro/performance/load/wellar-staging.k6.js). It has no default target, rejects the production Wellar hostnames, requires exact `K6_TARGET_ORIGIN` and `K6_ALLOWED_HOST` equality, explicit isolation/authorization flags, synthetic account/workspace values, a caller-defined concurrency ceiling no higher than 2,000, and explicit ramp/steady durations. It performs one login per VU and reuses the session cookie; it does not loop failed credentials. It models session/context, dashboard, workforce, notifications, request list, activity history and bounded report-export reads with randomized think times. It does not perform business record writes, account deletion, email delivery, notification creation, or workspace mutation.

This harness is **prepared, not validated or run** because k6 was unavailable. It is protocol-level and does not render Angular or measure browser navigation/usable dashboard time. The sample collection filters and selected fields must be reconciled with the exact staging schema and synthetic fixture IDs by the staging owner before use. The harness's reports endpoint is a bounded sample; it is not the full ReportsService fan-out. The real multi-query report workload should be measured against staging after confirming all collection names/permissions and fixture sizes.

Set all values only after approvals and use the staged k6 binary supplied by the environment owner. Example invocation after the missing prerequisites are satisfied:

```powershell
$env:K6_TARGET_ORIGIN = 'https://<approved-stage-host>:<port>'
$env:K6_ALLOWED_HOST = '<exact-approved-stage-host>'
$env:K6_TARGET_ISOLATED = 'YES'
$env:K6_RUN_AUTHORIZED = 'YES'
$env:K6_TEST_ACCOUNT_EMAIL = '<synthetic-test-account>'
$env:K6_TEST_ACCOUNT_PASSWORD = '<secret-injected-out-of-band>'
$env:K6_SYNTHETIC_WORKSPACE_ID = '<synthetic-workspace-id>'
$env:K6_MAX_VUS = '10'
$env:K6_VUS = '10'
$env:K6_RAMP = '2m'
$env:K6_STEADY = '10m'
$env:K6_SCENARIO = 'steady'
k6 run performance/load/wellar-staging.k6.js
```

Do not put real secrets in shell history or report output. For later tests, run independent capped stages `10 → 50 → 100 → 250 → 500 → 1,000 → 2,000`; observe each stage until latency, errors, CPU/memory, pool and DB metrics stabilize before raising the cap. For synchronized burst, run `K6_SCENARIO=burst` only after the corresponding steady stage is safe. The burst profile ramps to the requested VUs over 15 seconds, holds 45 seconds and ramps down over 30 seconds; it is intentionally bounded.

## 6. Executed Tests and Results

| Test | Status | Actual VUs / duration / rate / percentiles |
|---|---|---|
| Protocol load test | **Not run**: k6 not locally available and staging was not verified/authorized. | 0 VUs; 0 duration; 0 generated requests; no latency percentiles. |
| Browser performance test | **Not run**: no browser session against isolated staging. | No navigation timings, paint metrics or time to usable dashboard. |
| Directus/database resource observation | **Not run**: no staging credentials/observability endpoints. | No CPU, memory, connection pool, active DB connections or slow query data. |
| App build/tests | Not run; not required for this read-only readiness assessment. | No claims about test/build pass. |

There are no measured p50/p95/p99 values, arrival rates, failure rates, or resource measurements. The only frequency/rate values in this report are source-configured heartbeat timing and arithmetic estimates, clearly identified as such.

## 7. Resource and Database Bottlenecks to Measure

1. **Reports fan-out and record caps:** up to 2,500 scans/results/alerts with client-side joining. Capture per-query time, rows, payload, query plan and browser heap at realistic tenant sizes.
2. **Dashboard parallel query burst:** several collection reads plus workforce/queue response during navigation. Measure active DB connections and query concurrency per session.
3. **Workforce composite endpoint:** roster plus departments, eligible scan targets and request summaries in one response; may be expensive and non-paginated.
4. **Request/compliance reads:** some workflow collection queries use limits up to 800, and page composition can load roster, departments, scans and requests concurrently.
5. **Presence write load:** nominal ~33 PATCH requests/sec at 2,000 continuously visible users, before bootstrap/focus/resume bursts. Confirm write amplification, Directus activity hooks and DB indexing.
6. **Guard/session startup waterfall:** refresh → user identity → workspace context → page fan-out. Measure each stage and auth failure rates separately.
7. **Retry/fallback amplification:** schema permission fallback in notifications and other service-specific fallbacks can multiply calls under incompatible schema or permissions.
8. **Client response/render cost:** chart/model transformation, large tables and PDF creation need browser traces; no protocol test can prove client readiness.

Directus and PostgreSQL capacity are unknown. Require resource metrics from the exact stage deployment, including Directus CPU/memory/event-loop, request queue, pool saturation, PostgreSQL active/idle connections, locks, slow-query logs, cache hit rate and storage/network. A load generator must run outside the service host or its own resource use contaminates results.

## 8. Safety Stop Conditions

Before authorizing execution, the staging owner must set concrete numeric stop thresholds. At minimum, abort and hold traffic if any of the following occurs:

- Any request resolves to or redirects to a production host, any real customer identifier/record appears, or synthetic tenant isolation is uncertain.
- Unexpected writes, emails, SMS, push notifications, billing, external callbacks or non-test side effects are observed.
- 5xx/timeout rate exceeds the agreed threshold for two consecutive observation windows, or auth/session failure rises materially above baseline.
- Directus or PostgreSQL CPU/memory, queue depth, pool utilization, active connections, locks, disk or replication lag reaches the stage owner's defined safety limit.
- p95/p99 or DB latency exceeds the agreed stage SLO for two windows, or resource metrics do not recover after ramp-down.
- The load generator loses observability, cannot stop promptly, or target allowlist validation fails.

Numeric thresholds must come from the service owner and staging capacity; this report does not invent safe limits.

## 9. What “2,000 Concurrent Users” Means

It means 2,000 authenticated browser sessions concurrently active with a specified mix of route visits, idle/think intervals, visibility states and request actions. It does not imply 2,000 requests/sec. For a simple heartbeat-only steady state, source cadence implies around 2,000 / 60 ≈ 33 PATCH requests/sec while all tabs are visible, plus immediate startup/focus traffic. A navigation could add multiple simultaneous Directus reads; reports can produce much higher per-user request and row volume. A realistic capacity result requires the mix, duration, tenant sizes and refresh/session behavior to be explicit.

Even a successful k6 API run would establish only protocol/API/backend behavior for that workload. It would not prove Angular rendering speed, real browser memory use, accessibility, client chart/export responsiveness, or production capacity. Browser tests with instrumented real browsers and representative fixtures are separate.

## 10. PASS / FAIL / NOT TESTED

### **NOT TESTED — 2,000 concurrent users are not known to pass.**

No isolated staging target or authorization package was available in the project evidence, and the required load generator was not locally available. No traffic was sent. Therefore there is no basis to claim pass or fail at 2,000 users. The prepared harness is not a result.

## 11. Prioritized Changes if Later Tests Fail

This is a diagnostic priority list, **not a request to change the product now**:

1. If report journeys dominate, reduce report query volume through server-side aggregation/date bounds and pagination; compare exported totals against existing behavior.
2. If dashboard query concurrency saturates DB, consolidate/aggregate on the backend, cache safe tenant-scoped summaries and bound row counts.
3. If workforce is expensive, add cursor/page support or precomputed summaries rather than loading the full roster composite for every entry.
4. If auth/context startup is the bottleneck, measure and remove redundant guard/context round trips while retaining server-verified membership checks.
5. If presence is material, use backend-supported batching/longer cadence or a purpose-built presence channel after measuring correctness and operational cost.
6. If browser work dominates, profile Angular chunks, chart rendering and report transformations; consider incremental rendering and bounded exports.
7. If pool/query plans fail, tune indexes/query plans and Directus/PostgreSQL pool sizing only after evidence from staging, with migration/release review separate from this audit.

## 12. Exact Owner Approvals and Infrastructure Needed

Before any staged run, the authorized environment owner must provide and approve:

1. An exact staging API origin and hostname/port, confirmation it is not production, and written authorization for the requested test window and concurrency ceilings.
2. Evidence that the database, Directus process, extensions, object storage and all outbound integrations are isolated from production; production hostnames must be blocked at the network layer.
3. Disposable synthetic test accounts for each role and a synthetic workspace with known record counts for members, departments, requests, scans, scan results, alerts, notifications and reports; avoid real email addresses and external delivery.
4. A safe credential injection method and test-account session/cookie behavior; no production token or customer data.
5. Known Directus/PostgreSQL resource quotas, connection-pool limits, baseline utilization, observability dashboards and numeric stop thresholds; named on-call owner able to stop the test.
6. Confirmation that authentication/workspace setup, login, file handling and any test workflow cannot trigger email/SMS/billing/external integrations. Generic harness excludes business writes and workspace switching.
7. A cleanup procedure or a freshly restorable disposable database snapshot, plus confirmation of who will execute cleanup and verify no test records remain. Although the prepared journey is read-focused, auth/session records and backend audit telemetry may still be created.
8. Approval to make k6 available in the isolated test runner (without installing it into the application project), and a separately approved browser test runner if browser metrics are required.
9. Agreement on user journey distribution, think-time model, test duration, ramp schedule, burst profile, acceptable error/latency targets and stable-stage criteria.

## 13. Unknowns

- Whether a stage environment exists outside this repository; no evidence supplied.
- Exact deployed Directus and extension versions/configuration, database size, tenant row counts, indexes, pool settings and query plans.
- Actual production/stage route mix, active-user behavior, visibility distribution, API cache hit rates and session lifetime.
- Live behavior of app-specific routes, role permissions, response sizes and retry/error rates.
- Browser bundle sizes and critical-path render times; no build artifacts were measured in this task.
- Whether any external notification/email side effects are wired into test/stage routes.
- k6 harness compatibility with the exact staging Directus version and cookie policy; harness was not executed or validated.

