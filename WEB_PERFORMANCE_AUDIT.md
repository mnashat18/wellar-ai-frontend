# Web performance and reliability audit

Audit date: 2026-10-14 (checkout dated 2026-10-13)

## Executive finding

The Angular production build is healthy but this repository does not contain enough runtime or backend capacity evidence to certify a 2,000-active-employee launch. The production build emitted 953.44 kB raw initial JavaScript/CSS, estimated 204.80 kB transfer, plus lazy routes; its public landing CSS exceeds its component-style budget by 1.26 kB. The largest scale concern visible in this web repository is request fan-out and repeated large, often unscoped collection reads rather than initial download size.

This is a source and build audit, not a load test. The production host and API host could not be fetched with the available browser checker; there are no production traces, browser RUM, API latency percentiles, database plans, or concurrency test results in the repository. Do not interpret the 2,000-employee target as tested capacity.

## Measured evidence

| Check | Result | Evidence |
|---|---:|---|
| Angular unit tests | 63 files, 343 tests passed | `rtk npm test -- --watch=false`; run 2026-10-14 |
| Production bundle | Initial 953.44 kB raw; 204.80 kB estimated transfer | `rtk npm run build -- --configuration production` |
| Largest initial JS | `main` 384.97 kB raw / 71.44 kB transfer; next shared chunk 179.60 kB raw | Same build output |
| Lazy PDF dependencies | jsPDF 411.12 kB raw and html2canvas 202.84 kB raw | Same build output; both lazy chunks |
| CSS budget | `authlanding.css` 21.26 kB, 1.26 kB over 20 kB warning | Same build output |
| Scan-request page fan-out | 5 concurrent branches: workforce roster, queue, departments, scans, notifications; successful create then refreshes page data | `operations-workflows.service.ts:546-617`, `requests.ts:340-369` |
| Compliance page fan-out | 8 parallel branches; scan/result/consent reads each request up to 800 rows | `operations-workflows.service.ts:494-541` |
| Dashboard data fan-out | 6 source branches plus a dependent scan-results query filtered by collected scan IDs | `operational-dashboard.service.ts:330-390` |
| Presence heartbeat | One visible authenticated browser per minute, plus bootstrap/focus/visibility events; one request in flight; timeout 15s and linear backoff capped at 5m | `presence-heartbeat.service.ts:11-20,27-45,62-117,145-160` |

At 2,000 continuously visible, authenticated sessions, the configured heartbeat alone implies approximately 2,000 PATCH requests/minute (33.3 requests/second average), before login, focus events, page requests, notifications, or scans. This is a workload estimate from source cadence, not a production measurement; actual active tabs and background-tab throttling change it.

## Request, cache, and rendering findings

- `getRequestsPageData()` uses `forkJoin` for five separate requests. It obtains up to 800 wellness scan rows without a business-profile filter and up to 400 notifications with workspace filtering. `buildRequestsPageData()` then reconciles these snapshots in the browser. This is a straightforward request and payload multiplier across repeated visits.
- The requests page calls `refresh()` after every successful create (`requests.ts:358-364`), re-running the full five-branch load. A busy action therefore causes a burst even though the server already returned the new record.
- Compliance pulls up to 800 records each from scans, results, and consents; the shown scan/results/consent configs do not include an explicit workspace filter (`operations-workflows.service.ts:508-529`). Directus permissions may enforce scope, but client filters alone are not authorization. The API schema and permissions are outside this checkout, so verify server-side scoping before rollout.
- The dashboard first retrieves sources in parallel, then issues a result query for the collected scan IDs (`operational-dashboard.service.ts:330-390`). This is a useful bounded shape, but a broad scan source can still make the dependent `IN` list and result response large.
- Shared state does deduplicate some in-flight work: `CompanyContextService.restoreWorkspaceContext()` shares an in-flight restoration and keeps a successful result (`company-context.service.ts:700-752`); `AuthService.ensureSessionToken()` shares session checks (`auth.ts:301-310`). Cache invalidation and freshness are explicit only in selected services; do not assume all page requests are cached.
- The router lazy-loads most authenticated and informational pages (`app.routes.ts`). PDF export dependencies are lazy chunks. These reduce first-route delivery, while 384.97 kB raw main JS and 953.44 kB total initial output still merit mobile/network profiling.
- No application-wide `retry`/`retryWhen` policy or common HTTP timeout policy is present. Per-request timeouts range from 4s to 25s. This avoids indiscriminate write retries, but transient errors are handled inconsistently. The only recurring network timer found is presence; this source scan does not establish that external Directus/AI services do not poll.
- No service-worker/offline cache or browser-side HTTP cache policy is declared in Angular config. Nginx serves `index.html` with no-store and fingerprinted JS/CSS and media with one-year immutable caching (`nginx.conf`). Those rules are source evidence; live edge behavior was not measured.
- Angular templates and route code do not broadly opt into `OnPush` or zoneless change detection in the searched surface. Some pages explicitly call `detectChanges()` for async callbacks. No profiler evidence was available to identify actual change-detection bottlenecks; prioritize API/data volume and profile before a broad rendering rewrite.

## Reliability and overload behavior

- The presence heartbeat prevents overlap, suppresses rapid focus pings, times out at 15 seconds, and backs off transient failures. Its backoff is linear (`60s * failure streak`, capped at 5m), not exponential with jitter. It treats 408/429/5xx as transient but does not honor `Retry-After` (`presence-heartbeat.service.ts:145-160`). With synchronized clients, periodic requests can align; add jitter and server guidance in a coordinated change.
- Request reads generally surface or degrade to empty states; there is no shared policy to distinguish retryable idempotent reads from non-repeatable writes. Any future retry must be limited to safe reads or writes protected by a server idempotency key.
- The scan-request create button prevents a second submit in the current component instance (`requests.ts:308-369`); server-side creation uses a transaction, advisory lock by user/member, and rejects an existing open request (`index.js:2638-2730`). That controls duplicate open requests but is not request idempotency: a timeout followed by a retry after the first request commits can produce a conflict rather than return the original response.
- Scan request state is request lifecycle only: pending, completed, expired, cancelled, failed, and derived overdue (`index.js:1390-1403`). It is not a full AI job state machine. This repository does not show the AI scan submission, worker, result materialization, retry, or webhook consumer implementation.
- Scan request notification/activity writes occur transactionally, then push webhook dispatch occurs after commit with a 5-second abort timeout (`index.js:2732-2818`, `2084-2138`). There is no durable outbox/retry visible here; webhook delivery can be lost after a committed request if the process or downstream endpoint fails.

## Scan ID and result retrieval design

Keep three identifiers distinct: `scan_request_id` (the business request), `scan_id` (the canonical scan/job), and `scan_result_id` (the materialized result row). Generate `scan_id` server-side once when accepting a scan, preferably UUIDv7/UUID; never use a client timestamp, employee ID, or reusable request ID as a unique scan ID. Persist it before enqueueing and enforce a database unique constraint.

Recommended contract, to be agreed by AI Server, Web, and Mobile owners before implementation:

1. Client sends a stable `Idempotency-Key` UUID per user intent; retries of the same intent reuse that key. Server scopes uniqueness by authenticated principal and tenant, stores a request fingerprint, and returns the original accepted response for matching replays; same key with a different payload returns 409.
2. In one database transaction, validate tenant membership/role and target membership, insert a durable job row with `scan_id`, tenant/workspace ID, actor, target member, request ID (if any), payload hash, state `queued`, timestamps, and attempt count, and insert an outbox event. A unique `(tenant_id, principal_id, idempotency_key)` index protects acceptance; a unique `scan_id` index protects retrieval.
3. Return `202 Accepted` with `{ scan_id, status, status_url }`. Worker transitions are monotonic and timestamped: `queued -> running -> succeeded | failed`; optional `retry_wait` returns to `queued`, and `cancel_requested -> cancelled` is allowed only before completion. Store safe failure code separately from private diagnostics.
4. Expose `GET /scans/{scan_id}` and `GET /scans/{scan_id}/result`. Every lookup enforces authenticated tenant membership, target/user policy, and ownership/role on the server; never treat an unguessable ID as authorization. Return 404 for IDs outside the caller's visible scope to reduce enumeration.
5. Result records carry the same immutable `scan_id`, unique one-result-per-scan constraint (or explicit result version), tenant ID, schema version, and completion timestamp. Web/Mobile consume the same canonical API rather than independently guessing joins across `wellness_scans` and `scan_results`.
6. Coordinate additive schema/API rollout across AI Server and Mobile: additive columns/routes first, dual-read compatibility, then clients, then enforcement/cleanup. Define retention, deletion, timeout, cancellation, and replay behavior in that shared contract.

## Next measurements required for a 2,000-employee target

Run a representative authenticated load test against a staging environment with production-like indexes/permissions and the AI worker enabled. Include 2,000 sessions, realistic active-tab ratio, login/context restoration, dashboard open, request queue refresh, notification writes, scan submission/result polling, workspace switching, and 429/5xx injection. Record p50/p95/p99 latency, error and timeout rates, in-flight DB connections, slow query plans, worker queue age/depth, CPU/memory, and per-tenant fairness. Establish SLOs and a rollback threshold before traffic ramp.

Recommended targets to agree with product/ops (not measured current performance): API read p95 < 500 ms and write acceptance p95 < 1 s under target load; no cross-tenant result visibility; queue age alert at 2x normal; and bounded client request volume per page view.
