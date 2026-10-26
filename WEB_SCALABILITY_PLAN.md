# Web scalability plan for 2,000 active employees

This plan covers the Angular repository and its visible Directus extension boundary. AI Server and Flutter/Mobile implementation details are not present here; scan-job API/schema work must be agreed across all three clients/services before shipping.

## Capacity model and baseline

Source-derived steady-state estimate: presence writes every 60 seconds for each visible authenticated tab means about 2,000 requests/minute / 33.3 requests/second if all 2,000 employees keep one foreground tab open. Bootstrap and focus/visibility events add short bursts. The requests page launches five concurrent reads; compliance launches eight; dashboard launches six source reads and a dependent result read. These estimates define test inputs, not observed production load.

Current measurement baseline: Angular tests 343/343 passed; optimized build initial total 953.44 kB raw / 204.80 kB estimated transfer; landing stylesheet warning at 21.26 kB versus 20 kB. No RUM, backend SLO, load-test artifacts, database capacity, or live-site fetch evidence exists in the repo/audit tools.

## Phased work

### Phase 0 — establish a reliable baseline (1 sprint)

- Capture Web Vitals (LCP, INP, CLS), route chunk and cache-hit metrics, request count/duration/status by route, and JS exceptions. Use privacy-safe correlation IDs; never log cookies, authorization, questionnaire answers, or raw scan content.
- Define dashboard and scan-journey SLOs and operational owners. Add a staging load profile at 2,000 sessions and an agreed active-tab percentage. Gather API p50/p95/p99, 429/5xx, DB pool saturation, query plans, worker depth/age, and per-tenant fairness.
- Keep deploy/build metadata and client version in telemetry. Verify prod headers/cache behavior via external synthetic checks after the operator authorizes/has access to the deployed environment.

### Phase 1 — cut request amplification (1–2 sprints)

- Replace the scan-request view's five parallel fetches with a purpose-built paginated page API returning queue rows, summary counts, and only options needed to create a request. Avoid querying 800 scans and 400 notifications simply to derive request display state. In `getRequestsPageData()` and `loadScanRequestsSafe()`, consolidate duplicate request logic and avoid loading workforce roster twice through separate paths.
- Add pagination/cursor support and stable ordering to workforce, request, activity, alert, compliance, and report APIs. Fetch narrow fields. Remove hard-coded 800-row reads and use server aggregates for counts and coverage.
- Add server-enforced tenant/department scoping to every collection query and verify Directus permissions/RLS. A client query's `business_profile` filter is a payload optimization, never the isolation control.
- On create, patch the returned request into the local queue and refresh the summary only when needed; if a refresh remains, coalesce it and avoid rerunning optional roster/scan/notification reads.
- Cache immutable reference data (departments/options) by verified tenant + context version with short TTL and explicit invalidation on workspace switch/mutation. Do not cache sensitive scan results across tenant contexts.

### Phase 2 — scan acceptance and result lifecycle (cross-team, 2–3 sprints)

- Adopt the shared ID and API contract in `WEB_PERFORMANCE_AUDIT.md`: server-generated unique `scan_id`, tenant-scoped idempotency key, transactional job plus outbox acceptance, and authenticated status/result retrieval.
- AI Server owns durable queue, worker leases, bounded concurrency per tenant, dead-letter visibility, retry classification, and monotonic job transitions. Mobile and Web submit through the same contract and reuse the same key on transport retries.
- Create the acceptance schema/routes first as additive changes, then ship Mobile/Web dual-compatible clients, then enforce uniqueness/required fields. Include a replay test, duplicate worker delivery test, cross-tenant retrieval denial test, and result consistency test.
- Prefer push/SSE when the API platform supports authenticated fan-out. If polling is required, use a single polling coordinator only while a job is active, 2–5 second initial interval growing to 15–30 seconds, jitter, visibility pause, `Retry-After`, terminal stop, and a hard deadline. Do not poll every dashboard or every employee.

### Phase 3 — overload behavior and safe degradation (1 sprint)

- Centralize read timeout and retry behavior. Retry only GET/idempotent operations on network errors, 408, 429, and selected 5xx; use bounded exponential backoff with full jitter, respect `Retry-After`, cap attempts, and cancel on route teardown/context change. Never automatically replay POST/PATCH unless the server guarantees idempotency.
- For 429, show a recoverable busy state and next retry hint. For 5xx/network failure, preserve stale non-sensitive page data with an age marker, not empty-success data. Keep permission/schema errors terminal and visible as degraded scope.
- Add an overload gate for expensive report/export or scan-start actions and protect per-tenant fairness with quotas. Capacity and rate limits must be based on actual worker/database measurements.
- Add server-side webhook outbox retry and dead-letter monitoring for scan-request events; the current post-commit, 5-second webhook call is best-effort.

### Phase 4 — payload and rendering budget (ongoing)

- Keep public landing route and authenticated shell measured separately. Lazy-load large visualizations/export code; PDF libraries are already lazy chunks (jsPDF 411.12 kB raw, html2canvas 202.84 kB raw), so preserve that boundary.
- Reduce `authlanding.css` below the 20 kB warning budget and set a deliberate initial bundle target after verifying the route composition. Track compressed transfer budgets in CI, not only raw build size.
- Profile pages with realistic 2,000-member datasets. Use `OnPush`/signals, stable `track` keys, virtualization, and memoized selectors where profiler data shows repeated rendering. Server pagination is required before client virtualization can solve memory/query pressure.
- Keep fingerprinted assets immutable and `index.html` revalidated/no-store. Validate actual CDN/Nginx cache headers and compression in production synthetic checks.

## Rollout gates

1. Staging load test meets the agreed SLO at target and 1.5x burst; no tenant leakage under adversarial IDs/context switching.
2. Scan acceptance idempotency, queue replay, result retrieval, and cross-client compatibility tests pass.
3. 429/5xx drills recover without duplicate scans, request storms, or stuck in-flight UI.
4. Dashboard/requests p95 and API calls per route improve against baseline; database plans use intended indexes and no unbounded response grows with tenant size.
5. Canary a small tenant cohort, then ramp with automatic pause on error budget, queue age, database pool, or cross-tenant alert signals.

## Ownership and coordination

Web owns Angular call consolidation, display/recovery states, browser telemetry, and client bundle budgets. AI Server owns job durability, worker scheduling, idempotency, result API, tenant authorization, and queue observability. Mobile owns compatible request/status integration. Directus/API and DB owners approve schema/index/permission changes. Treat scan ID semantics and state transitions as a versioned cross-team contract; do not ship a web-only interpretation.
