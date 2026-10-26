# Wellar Web Application — Complete System Audit

**Audit date:** 2026-10-14  
**Repository:** existing checkout at `D:\flutter\wellar-pro`  
**Mode:** source inspection only. No application files were changed; this Markdown report is the sole new file. No API, tests, build, migration, or deployment was run.  
**Important scope boundary:** this frontend does not integrate Wellar AI V2. No Wellar AI V2 integration is assumed or described.

## 1. Executive Summary

This is a standalone Angular 21 browser application, built with the Angular CLI application builder, TypeScript 5.9, RxJS 7.8, and a static Nginx deployment image. It uses Angular standalone components, route-level lazy loading, functional/class route guards, and a custom `HttpInterceptor`.

The main remote service is Directus at the environment-configured `https://dash.conntinuity.com` origin. The browser calls both Directus REST resources (`/items/...`, `/users/me`, `/auth/...`) and Wellar-specific routes (`/wellar/...`); one invite path can trigger a Directus flow. The repository includes a Directus workspace extension implementation under `directus-extensions/wellar-workspaces`, but this checkout cannot establish that the extension is installed or that its global permissions, database constraints, cookie policy, and deployment match source.

Authentication is session-cookie oriented: requests to the API origin carry credentials, caller Authorization headers are stripped, and no access token is returned by the visible token accessor. The client persists identity and active-workspace hints in browser storage. Route guards revalidate session/context in selected paths, but client-side checks do not replace server authorization.

The route table declares **52 route records** (including redirects, the wildcard, the `/app` parent and the custom matcher; not 52 unique pages). There are **approximately 90 distinct endpoint templates** visible in first-party TypeScript, counting templated collection routes as one template and excluding tests; the total can vary based on whether the same templated collection path is called with different methods/query shapes. The endpoint catalog below inventories the request families and names the unresolved dynamic values. Exact live reachability and server response contracts remain unverified.

Principal engineering risks are (1) broad/direct collection access whose effective tenant isolation is backend-dependent, (2) cookie/CSRF/CORS settings are outside this checkout, (3) client route guards and local storage can be bypassed and are not authorization, (4) collection reads and reports may retrieve large datasets without consistent pagination, and (5) extensive unverified API contracts with generic/weak response typing and no live integration evidence.

## 2. Scope and Evidence Method

Inspected root project configuration, `src/app/app.routes.ts`, application/bootstrap files, environment files, first-party service and page source, route- and service-adjacent tests, Docker/Nginx config, the checked-in Directus workspace extension source/README/tests, and existing audit documents. The latter are contextual material and are not treated as proof beyond evidence confirmed in source.

Source references use repository-relative paths and `:line` where useful. Endpoint templates are consolidated when the same template is called repeatedly or assembled from a collection variable. `:id`, `${collection}`, query-string values, form values, environment variables, and timestamp cache-busters are runtime values, not resolved server contracts. Component templates were reviewed to identify the routed user surfaces; a source-level audit cannot validate browser rendering or backend outcomes.

Evidence levels used here:

| Label | Meaning |
|---|---|
| Source-observed | Explicit code path, URL construction, request, guard, storage or UI declaration is present. |
| Test-observed | A checked-in unit test asserts a request, state transition, or component behavior using mocks. Tests were not run during this audit. |
| Runtime-unverified | Depends on a live backend, browser, deployment, external provider, or runtime-specific behavior not observed here. |
| Inference | Likely user effect based on UI and request code; the actual server result is not established. |

Coverage is broad but not a claim of exhaustive execution coverage: all route declarations were read, endpoint construction was searched across app TypeScript, and principal feature/services were inspected. No running application, API, generated build output, or live provider was exercised. `node_modules`, generated `dist`, and extension `dist` are not treated as authoritative source implementations. No attempt was made to enumerate every individual element of every large template or prove all call graph edges statically.

## 3. Technology Stack

| Area | Evidence |
|---|---|
| Framework | Angular `^21.1.0` (`package.json`); standalone Angular components and `provideRouter` (`src/app/app.config.ts`). |
| Language | TypeScript `~5.9.2`; application and spec TypeScript configs. |
| Reactive/data | RxJS `~7.8.0`; Angular `HttpClient`, Observables, Signals in root app. |
| UI/visualization | CSS, Tailwind CSS `^3.4.17`, Chart.js `^4.5.1`; project-local components and CSS. |
| Export | `jspdf` and `jspdf-autotable`; report export service. |
| Tests | Angular unit-test builder, Vitest, jsdom; Playwright and `playwright.config.ts` are present. Tests were not executed. |
| Build | `@angular/build:application`, browser entry `src/main.ts`, production default; `ng build` scripts. |
| Package manager | npm 10.9.4 declared as packageManager. |
| Deployment | Multi-stage Node 20 Alpine build then Nginx Alpine static serving (`Dockerfile`); SPA fallback and headers in `nginx.conf`. |
| External data plane | Directus-compatible REST API and Wellar-specific routes on configured API origin. |

Dependency versions are semver ranges from `package.json`; actual lockfile-resolved versions were not enumerated here. No package installation was run.

## 4. Directory and Architecture Map

| Directory | Responsibility / evidence |
|---|---|
| `src/main.ts`, `src/app/app.ts`, `src/app/app.config.ts` | Bootstrap, root component, providers and router. |
| `src/app/app.routes.ts` | Entire route tree, mobile legacy matching, redirects, lazy imports and guards. |
| `src/app/Pages/` | Operational pages: dashboard, workforce, requests, reports, compliance, alerts, activity, company, invites, profile/settings, workspace flows, employee access and mobile pages. |
| `src/app/public.layout/` | Public marketing/legal pages and auth landing/modal, reset, account deletion, upgrade/payment surfaces. |
| `src/app/services/` | Auth, organization, workspace, dashboard, workflow, reporting, notifications, compliance, operations and invite service adapters. |
| `src/app/core/` | Workspace/company context and presence heartbeat. |
| `src/app/dashboard-shell/`, `src/app/Layout/` | App shell, sidebar/header/topbar and company selector. There are both newer and legacy layout implementations. |
| `src/app/shared/` | Errors, formatting, protected file/avatar URLs, badges, skeletons, dialogs and notification UI. |
| `src/app/components/` | Reusable charts, request modal, notifications, onboarding guide and subscription ad. |
| `src/environments/` | Production/development API and URL configuration. |
| `directus-extensions/wellar-workspaces/` | Directus extension implementation, tests and README; operational status not established. |
| `server/` | One administrative Node script (`fix-member-role-typo.js`), not an app server. It can modify remote records if run and was not run. |
| `e2e/`, `tools/` | E2E/support assets present; detailed execution and coverage were not validated. |
| `public/`, `src/assets/` | Static public and branded assets. |
| Root config | `angular.json`, `tsconfig*.json`, Tailwind/PostCSS, `Dockerfile`, `nginx.conf`, `proxy.conf.json`. |

Feature/page components are mostly standalone and imported lazily in routes. UI state generally lives in component fields/signals and service-level RxJS observables; no NgRx or other central state package is declared. There are no Angular feature NgModules in the route architecture shown.

## 5. Application Startup Lifecycle

1. `src/main.ts` bootstraps `App` with `appConfig` (Angular standalone bootstrap; verify exact source in `src/main.ts`). `app.config.ts` installs the router with anchor scrolling, `HttpClient` with DI interceptors, and `AuthInterceptor`.
2. `App` reads `localStorage.theme`, sets the root `dark`/`light` class, and inspects `/invite/:token`. Invite tokens are copied to `sessionStorage`, the localStorage alias is removed, and the app navigates to claim or signup. It calls `captureAuthFromUrl()` except on `/auth-callback`; when `auth_callback_pending` is set it calls `ensureSessionToken()` (`src/app/app.ts`).
3. Router matches a route, applying `canMatch` viewport checks and route `canActivate` guards. The mobile legacy routes require both narrow viewport and touch capability, so a narrow desktop window alone does not select them (`app.routes.ts:isMobileViewport`).
4. Authenticated guards call `AuthService.ensureSession()`. Workspace routes additionally retrieve or refresh verified company context via `CompanyContextService` / `WorkspaceContextApiService`.
5. The API interceptor attaches `withCredentials: true` for requests whose origin equals `environment.API_URL` and strips any `Authorization` header. It does not retry failed requests (`src/app/services/auth.interceptor.ts`).
6. Routed standalone page code initializes service requests and component state. Lazy route chunks are downloaded on navigation. No universal startup API sequence exists; the exact requests depend on route and context.

No service worker, explicit Angular HTTP cache, WebSocket, or SSE setup was found in inspected app source. Presence uses an HTTP heartbeat interval rather than a socket.

## 6. Complete Route Inventory

`src/app/app.routes.ts` contains 52 route records. Some paths have mobile/desktop alternatives, aliases or redirects. Rows are grouped by routing purpose; the redirect records count toward 52.

| Path / matcher | Component or result | Access / notes |
|---|---|---|
| `/dashboard` (mobile match) | `DashboardMobileComponent` | Touch + ≤768px; onboarding guard. |
| `/audit-logs` (mobile match) | `AuditLogsMobileComponent` | Touch + ≤768px; onboarding + owner-workspace guard. |
| `/requests` (mobile match) | `RequestsMobileComponent` | Touch + ≤768px; onboarding guard. |
| `/history` (mobile match) | `HistoryMobileComponent` | Touch + ≤768px; onboarding guard. |
| `/profile` (mobile match) | `ProfileMobileComponent` | Touch + ≤768px; onboarding guard. |
| `/dashboard` desktop fallback | Redirect `/app/dashboard` | After mobile `canMatch` fails. |
| `/requests` desktop fallback | Redirect `/app/scan-requests` | After mobile `canMatch` fails. |
| `/history` desktop fallback | Redirect `/app/dashboard` | Legacy URL. |
| `/profile` desktop fallback | Redirect `/app/workspace-access` | Legacy URL. |
| `/audit-logs` desktop fallback | Redirect `/app/dashboard` | Legacy URL; audit logs page is mobile legacy only. |
| `/` and `/download-app` | Public layout; auth landing and download page | No route auth guard. `/` handles login/signup modal modes. |
| `/delete-account`, `/request-welcome`, `/about`, `/contact`, `/careers`, `/privacy`, `/terms`, `/security`, `/pricing` | Lazy public components | Static/public surfaces; see individual page components. |
| `/upgrade-plan`, `/payment` | `UpgradePlanComponent` | Payment access guard; same component. |
| `/reset-password` | `ResetPasswordComponent` | Public token-driven form. |
| `/login`, `/signup` | Redirect to `/?auth=login|signup` | Modal on home, not standalone page. |
| `/app/welcome` custom matcher | `WelcomePageComponent` | Session, onboarding and welcome-intent guards. |
| `/app` | `AppShellComponent` with child routes | Session + onboarding guards at shell. Empty child redirects to dashboard. |
| `/app/dashboard` | Dashboard | Workspace + employee operational guards. |
| `/app/workforce` | Workforce | Same guards. |
| `/app/scan-requests`, `/app/requests` | Requests; second is child redirect | Workspace + employee operational guards on page. |
| `/app/company`, `/app/company/settings` | Company; settings redirects to company | Workspace, employee and owner/HR role checks. |
| `/app/invites` | Invites | Workspace, employee and owner/HR checks. |
| `/app/compliance` | Compliance | Workspace + employee operational guards. |
| `/app/alerts` | Alerts | Workspace + employee operational guards. |
| `/app/activity` | Activity | Workspace, employee and owner/HR checks. |
| `/app/reports` | Reports | Workspace + employee operational guards. |
| `/app/settings` | Settings | Workspace, employee and owner/HR checks. |
| `/app/workspace-access` | Workspace access/setup selection | In shell; deliberately available for context recovery. |
| `/app/workspace-activating` | Workspace activation | In shell; intended pending activation state. |
| `/app/workspace/request` | Workspace request | Dashboard workspace guard. |
| `/app/my-readiness` | Redirect `/employee-web-access` | Legacy route. |
| `/app/workspace-restricted` | Restricted explanation | Dashboard workspace guard. |
| `/verify-email` | `VerifyEmailComponent` | Standalone verification page. |
| `/auth-callback` | `AuthCallbackComponent` | OAuth/session restoration. |
| `/invites/claim` | `InviteClaimPageComponent` | Token claim flow; no explicit guard in route table. |
| `/employee-web-access` | Employee access page | Session + dashboard workspace guard. |
| `**` | `NotFoundComponent` | Fallback. |

Not declared as routes (therefore not directly routable under their filesystem names): `/app/company/settings` (redirect only), legacy `Pages/history`, `Pages/profile`, `Pages/audit-logs`, `Pages/departments`, `Pages/members`, `Pages/company-setup`, `/ia/*`, and old `Layout/*` components. Their existence alone does not make them reachable.

## 7. Page-by-Page Detailed Documentation

The following summarizes routed pages, visible control families and their source-defined effects. Where a page template offers controls, only the associated action implemented in source is claimed. Exact outcome depends on backend and was not runtime-verified.

| Route / page | Intended role and visible purpose | Data, actions and navigation | Evidence / status |
|---|---|---|---|
| `/` — `Authlanding` | Public visitor; landing content and login/signup modal, invite context and auth entry. | Login/signup fields, email-availability checks, password/phone/OAuth flows, reset links, invite token parsing, navigation to app after successful auth. Uses auth service; query params `auth`, `invite`, `token`, `code`. | `public.layout/authlanding/{authlanding.ts,authlanding.html}`; login modes and debounce/cache visible. Backend auth unverified. |
| `/download-app` — `DownloadAppLanding` | Visitor; download/promotional info. | Links only, no API observed. | `public.layout/download-app/*`; static content. |
| `/about`, `/contact`, `/careers`, `/privacy`, `/terms`, `/security`, `/pricing` | Public visitor; informational/legal/pricing content. | Static links/content in page components/templates; no service request observed. | Corresponding `src/app/public.layout/<page>/`. Pricing display does not prove checkout. |
| `/delete-account` — `DeleteAccountComponent` | Account holder; submit deletion request. | Confirmation form posts email/confirmation data to `/wellar/account-deletion-requests`; success/error rendered by local state. No deletion execution claim: endpoint is a request workflow. | `public.layout/delete-account/delete-account.ts`; extension source implements request route. Backend activation unknown. |
| `/request-welcome` — `RequestWelcomeComponent` | Visitor returning from request flow. | Reads `hasRequest`, `email`, `next` query params; normalizes next path and renders confirmation/navigation. | `public.layout/request-welcome/request-welcome.ts`; query values may be user-controlled. |
| `/login`, `/signup` | Auth visitor. | Redirect to public home modal `?auth=...`. | `app.routes.ts`; actual auth page is home component. |
| `/reset-password` — `ResetPasswordComponent` | Password reset recipient. | Token from URL; new-password form invokes `/auth/password/reset`; timer/UI status and error mapping. | `public.layout/reset-password/reset-password.ts`; no token validity proof offline. |
| `/verify-email` — `VerifyEmailComponent` | New account user. | Verification messaging and URL token handling; exact server side verification mechanism depends on callback/link backend. | `verifyemail/verifyemail.ts`; runtime behavior not verified. |
| `/auth-callback` — `AuthCallbackComponent` | OAuth/session callback user. | Captures auth URL context/session cookie, `ensureSession()`, resolves workspace route, queues welcome intent, recovers to login with notice on failure. | `auth-callback/auth-callback.ts`, `services/post-login-routing.service.ts`; cookie behavior external. |
| `/app/welcome` — `WelcomePageComponent` | New/returning/invite user. | Displays intent-derived message, five-second countdown, button “Enter workspace”; auto/manual route to intent destination; timers cleared on destroy. | `Pages/welcome/welcome.ts`; no endpoint itself. |
| `/app` shell | Authenticated organization user. | Header/sidebar, company selector, notifications/presence/global app chrome; outlet contains child page. | `dashboard-shell/app-shell.component.*`, `topbar`, `sidebar`, `select-company`; shell initialization services. |
| `/app/dashboard` — Dashboard | Owner/HR/manager workspace; employee is redirected away. | KPI cards/charts, onboarding/empty states, date/range or dashboard controls; loads dashboard and operational metrics services; company switching resets/reloads context and data. | `Pages/dashboard/dashboard.{ts,html}`, `dashboard.service.ts`, `operational-dashboard.service.ts`; tests cover context-switch stale-data behavior. |
| `/app/workforce` — Workforce | Owner/HR/manager; roster and departments. | Search/filter, row expansion, invitation/action query `invite=1`; roster loads through `/wellar/workforce`; row/member operations depend on service. | `Pages/workforce/workforce.ts/html`, `workforce-roster-api.service.ts`; full server semantics unverified. |
| `/app/scan-requests` — Requests | Workspace operators; review/manage scan requests. | Filters/search/status tabs, select/review/resolve/assign/request actions and modal; workflow service requests queue/detail/actions. | `Pages/requests/requests.{ts,html}`, `operations-workflows.service.ts`, `create-request-modal`; implementations and tests present. |
| `/app/compliance` — Compliance | Organization operator; compliance posture/scan records. | Filter by departments/status/time, summary/records and detail views; loads departments, scans, results/consents through service. | `Pages/compliance/compliance.{ts,html}`, `compliance.service.ts`; service contract mocked in tests, backend scope remains critical. |
| `/app/alerts` — Alerts | Organization operator; risk alerts and review. | Filter/group/sort, select alert, review/resolve workflow and detail/action controls; service requests alert collections and Wellar actions. | `Pages/alerts/alerts.{ts,html}`, `operations-workflows.service.ts`; server state transition unverified. |
| `/app/activity` — Activity | Owner/HR; activity/event history. | Query/event selection via `event` query parameter, filters and event detail; service reads activity events. | `Pages/activity/activity.ts/html`, `business-center.service.ts`. |
| `/app/reports` — Reports | Workspace reporting user; build/export reports. | Report selection, date/filter controls, preview/table, export; data queried from configurable collections; PDF export via jsPDF/autotable. | `Pages/reports/reports.{ts,html}`, `reports.service.ts`, `reports-pdf-export.service.ts`; actual row volume and export output unverified. |
| `/app/company` — Company | Owner/HR; company profile and departments. | Tabs/query `tab`, edit profile, department CRUD and member/company configuration; `organization-api.service.ts` uses `/wellar/organization*`; older service also reads Directus collections. | `Pages/company/company.{ts,html}`, organization services. UI submits do not prove backend authorization. |
| `/app/invites` — Invites | Owner/HR; invite and pending-invite administration. | Invite list, create/revoke/resend/copy invite actions; Wellar workspace invite API and invite service. | `Pages/invites/invites.{ts,html}`, `services/invites.ts`, `operations-admin.service.ts`. |
| `/invites/claim` — InviteClaimPage | Invitee. | Reads token/code/invite query, validates/claims invite, tracks in-progress/success markers, may create/join context and route to welcome or workspace access. | `Pages/invites-claim/invites-claim.ts`, `services/invites.ts`; actual claim result backend-dependent. |
| `/app/settings` — Settings | Owner/HR; account/workspace preferences. | Account profile/avatar, preference toggles, tab query, upload, profile save, password or notification settings depending selected tab; reads `/users/me`, PATCH profile, Directus files. | `Pages/settings/settings.{ts,html}`, settings tests. Local preference keys persist in localStorage. |
| `/app/workspace-access` — Workspace access | Authenticated user without active context; select/join/create/request workspace. | Lists memberships/invitations; switch workspace, accept invite, create workspace or submit request; return URL/lock state in sessionStorage. | `Pages/workspace-access/workspace-access.ts/html`, context/creation/applications services; service operations do not prove remote activation. |
| `/app/workspace-activating` — Workspace activating | New workspace user. | Shows activation/wait state, polling/countdown or navigation logic. | `Pages/workspace-activating/workspace-activating.ts/html`; check exact timers in source; activation completion backend is unverified. |
| `/app/workspace/request` — Workspace request | User requesting a workspace. | Form submission through workspace applications service, success/recovery navigation. | `Pages/workspace-request/workspace-request.ts`; endpoint response unverified. |
| `/app/workspace-restricted` — Restricted | User redirected for missing role/context permission. | Displays restricted reason from query and navigation to recovery/workspace. | `Pages/workspace-restricted/workspace-restricted.ts`; no authorization grant is made here. |
| `/employee-web-access` — Employee access | Employee role. | Employee-scoped readiness/access display and links; employee is redirected here from operational routes. | `Pages/employee-web-access/employee-web-access.ts/html`; server access boundaries unverified. |
| `/dashboard`, `/requests`, `/history`, `/profile`, `/audit-logs` on mobile | Touch mobile users, legacy route family. | Dashboard cached summary; requests list and status actions; history; profile editing/avatar; audit logs export/list. Mobile routes differ in route reachability from desktop aliases. | `Pages/mobile/*`; local dashboard cache; requests has optimistic state; profile and audit logs make direct HttpClient calls. |
| `**` — NotFound | Any unmatched path. | Not found message and navigation links. | `Pages/not-found/not-found.ts`; no API. |

Page-state patterns: loading and error fields are implemented per component, with shared `loading-state`, `error-state`, `empty-state`, skeleton components, safe error mapper and global notifications. These patterns exist; consistent coverage across all pages is not established. No page-level cache policy can be assumed from `HttpClient` alone.

## 8. Every User Action and Its Effects

| User action | UI → service/request → state/navigation |
|---|---|
| Enter login/signup details | Form validation in `Authlanding`; optional debounced email availability POST; login/register request; `users/me` identity fetch; persist non-secret identity hints; resolve verified workspace; route to welcome, dashboard, employee access or workspace recovery. |
| Continue with Google | Browser top-level navigation to Directus `/auth/login/google` with redirect/callback parameters; callback restores session via cookie and profile fetch. This is navigation, not XHR. |
| Request/reset password | Email request POST; later token + new password POST; response status maps to user-facing notice. No mail delivery guarantee from frontend. |
| Logout | POST `/auth/logout` with credentials; on completion reset auth generation, clear identity/workspace/invite hints, dispatch logout event, navigate to `/`. Server cookie invalidation is unverified. |
| Switch workspace | Company selector calls `/wellar/workspaces/switch` with membership ID; returned active workspace/membership updates verified context and storage; downstream pages reload. Tests check stale prior-company data is not retained. |
| Create workspace | Access flow validates fields, uses session lock/return target, posts configured create endpoint or Wellar create endpoint; parses response, transitions to activation/recovery. Duplicate suppression is client-side only. |
| Accept/claim invite | Token retained in sessionStorage; claim endpoint or configured Directus flow invoked; local claim markers and context refresh; success welcome route or error/retry UI. |
| Filter/search/tab | Component updates local filter/query state and either derives visible rows locally or reloads service data; query params are used for selected tabs/events in some pages. No general request cancellation guarantee. |
| Create/edit/delete company or member data | Component validation and service mutation; HTTP response updates local state or reload; backend validation/authorization is outside source. |
| Resolve/review alert/request | UI selection and status/action payload sent to Wellar workflow route; local loading/error state and list refresh/update follows. Exact transition constraints are server-defined. |
| Generate/download report | Reports service retrieves records; export service builds PDF in browser. Large response and memory implications depend on selected data. |
| Upload avatar/file | FormData request to Directus file endpoint; response file ID stored in profile; protected avatar helper loads authenticated file URL. Upload size/type enforcement is not proven by client alone. |
| Dismiss onboarding/ads | Local storage remembers dismissal/shown item; no backend request necessarily. State can differ across browser profiles and be modified by script/user. |
| Refresh or reopen tab | Angular bootstraps; cookies may restore session; auth callback/pending markers and localStorage hints are read. Guards can call `/auth/refresh`, `/users/me`, workspace context; behavior depends on cookie validity and per-tab sessionStorage. |

## 9. Complete API Endpoint Catalog

**Base URL:** `environment.API_URL`, `authApiUrl`, and `DIRECTUS_URL` resolve to `https://dash.conntinuity.com` in checked-in development and production environments. `environment.ts` is local/default and `environment.development.ts` is selected in dev; production replacement selects `environment.prod.ts`. Paths below are source-visible templates. Common headers: JSON except file upload; the interceptor attaches credentials and strips Authorization for configured API origin. Some services redundantly set `withCredentials`.

### Auth and identity

| Method | Endpoint template | Caller / trigger and body/query | Result handling / evidence |
|---|---|---|---|
| POST | `/auth/login` | `AuthService.login`; credentials body; JSON; with credentials. | Parses auth result then `/users/me`; safe auth error mapping. |
| POST | `/users/register` | Signup; registration fields. | Then login/profile flow; exact server response unknown. |
| POST | `/auth/password/request` | Password reset request; email. | Status notification. |
| POST | `/auth/password/reset` | Reset page; token + password fields. | Local success/error state. |
| POST | `/auth/phone/request` | Phone verification; phone payload. | Status/error state. |
| POST | `/auth/phone/verify` | Verification code payload. | Status/error state. |
| GET | `/auth/login/google?...` | Top-level Google auth redirect with redirect parameters. | Browser navigation; provider/external callback. |
| GET | `/users/me?fields=...` | Auth/session restoration and profile/context. | Identity parsed; identity hints saved to localStorage; sometimes timestamp query. |
| POST | `/auth/refresh` | Cookie session refresh `{mode:'session'}`; `withCredentials`. | No retries beyond the defined single mode; 16-second current-user timeout elsewhere; missing route cached in sessionStorage. |
| POST | `/auth/logout` | Logout; session mode, credentials. | Client reset on completion; failure path handling is service-specific. |
| POST | `/wellar/auth/email-availability` | Signup, `{email}`. | `{data:{available:boolean}}` expected; client debounce/cache. |

### Workspace and invites

| Method | Endpoint template | Caller / trigger / parameters | Contract notes |
|---|---|---|---|
| GET | `/wellar/workspaces/context[?_ts=timestamp]` | `WorkspaceContextApiService.getContext`; force refresh appends cache-buster. | Expected `{data:{active,memberships,invitations}}`; 10s timeout and runtime shape parsing. |
| POST | `/wellar/workspaces/switch` | Switch membership; `{membership_id}`. | Expected `{data:{workspace,membership,department}}`; 10s timeout. |
| POST | `/wellar/workspaces/create` | Workspace creation service; request form/context. | Also configured as absolute `WORKSPACE_CREATE_ENDPOINT`; response parser tolerates envelopes. |
| GET/POST/PATCH | `/wellar/workspaces/applications...` | Workspace application service: read existing/pending applications, create/update/request state. | Query and body assembled in service; expected `data` envelope. |
| GET/POST/PATCH/DELETE (where code path defines) | `/wellar/workspaces/invites` and `/wellar/workspaces/invites/:id` | Invite list/create, accept/claim/resend/revoke/resolve operations across invite and operations-admin services. | Dynamic ID URL-encoded; request body/action variants differ; inspect `services/invites.ts` and `operations-admin.service.ts` for exact operation-specific payloads. |
| POST | `${API_URL}/flows/trigger/${DIRECTUS_CLAIM_INVITE_FLOW_ID}` or configured override | Invite flow fallback when configured; flow ID is environment constant; body is invite claim context. | `CLAIM_INVITE_FLOW_ENDPOINT` is empty in checked-in environments; fallback construction exists. Availability/activation not known. |
| GET/PATCH | `/items/business_profile_members[?filter...]`, `/items/business_profiles?...` | Context verification, member lookup and workspace create/switch support. | Dynamic query filters, fields and paging values; shape varies by caller. |

### Organization, roster and business-center collections

| Method | Endpoint template | Used by |
|---|---|---|
| GET | `/wellar/organization` | `OrganizationApiService.getOrganization`, company settings/profile. |
| PATCH | `/wellar/organization/profile` | Save organization profile. |
| POST | `/wellar/organization/departments` | Create department. |
| PATCH | `/wellar/organization/departments/:id` | Edit department. |
| POST | `/wellar/organization/departments/:id/...` | Department-associated operation (exact suffix is dynamically assembled in `organization-api.service.ts`). |
| GET | `/wellar/workforce?...` | Roster service; filters/scope sent in query. |
| GET/POST/PATCH | `/items/business_profiles`, `/items/business_profile_members`, `/items/departments` | Business center/company/context reads and changes; query includes IDs, fields, filters, sort/limit. |
| GET/POST/PATCH | `/items/requests`, `/items/request_invites` | Business center request and invite workflows; includes ID-specific request patches. |
| GET/POST | `/items/reports_exports` | Export job records and creation. |
| GET | `/items/activity_events` | Activity timeline/analytics. |
| GET | `/items/organization_members` (collection through `OrganizationService`) | Legacy organization read. |

### Operational, compliance and dashboard reads/workflows

| Method | Endpoint template | Used by / behavior |
|---|---|---|
| GET | `/items/${collection}?${params}` | Generic typed collection fetchers in dashboard, operational dashboard, reports, operations-support/admin, compliance and workflows. Collection variable must be resolved at caller. Query filters/fields/sort/limit differ. |
| GET | `/wellar/scan-requests...` | Queue service with query filters/pagination/scope; response parsed as queue wrapper. |
| POST | `/wellar/scan-requests...` | Create/start/review/resolve scan request actions; action path/body dynamic. |
| GET | `/wellar/alerts...` | Alert detail/queue/actions, dynamically formed paths. |
| POST/PATCH | `/wellar/alerts...` | Alert workflow start/review/resolve actions. |
| GET/PATCH | `/items/alerts...` | Directus alert list/detail or review-state operations. |
| GET | `/items/wellness_scans`, `/items/scan_results`, `/items/consents`, `/items/departments` | Compliance service; broad reads filtered by service query parameters and limits. |
| GET | `/items/notifications?...` | Notification metadata/notification rows. Service may load field metadata before listing; cache-buster on list. |
| PATCH | `/items/notifications/:id` | Mark/read or update notification state. |
| GET | `/items/${collection}?${params}` (reports) | Report datasets, with date/tenant filters, dynamic collection. |

### Profile, file, audit, presence and public flows

| Method | Endpoint template | Caller / trigger |
|---|---|---|
| GET/PATCH | `/users/me` | Profile and settings load/update, presence heartbeat. Fields/body differ. |
| GET | `/items/business_profiles?...`, `/items/departments?...` | Profile/company display helpers and context. |
| POST | `/files` | Profile/avatar upload using `FormData`; response file ID expected. |
| GET | `/assets/:fileId` or `/files/:fileId` protected URL | Protected avatar loader; actual helper chooses URL based on file ID/URL. Authenticated binary response as Blob. |
| GET/POST | `/items/audit_logs?...` or audit-specific endpoint | Audit logs screen builds filtered list/export; mobile audit logs uses direct HttpClient. |
| POST | `/wellar/account-deletion-requests` | Public account deletion request form; payload includes confirmed request details. No account deletion itself is claimed. |
| PATCH | `/users/me` | `PresenceHeartbeatService`; periodic current-user/presence field update (source payload limited to service). |

### Endpoint request policy and limits

`AuthInterceptor` has no automatic retry, timeout, refresh-on-401, or anonymous replay; its source comment explicitly avoids retrying authenticated writes anonymously. Timeout is explicitly 10s for workspace context/switch and 16s for one current-user-after-restore helper; most requests have no local timeout visible in service code. Cancellation is generally Angular subscription teardown; no global request cancellation policy was found. Cache busting (`_ts=Date.now()`) appears in selected identity/context/list reads. Error mapping is inconsistent: some services map safe errors, others expose typed service errors or retain raw status; no universal backend error schema is guaranteed.

**Reachability/dead-code caveat:** route-level service use establishes likely reachability for primary page flows; imported but unreferenced service methods and legacy components may not be reachable. Endpoint existence in source does not establish API deployment. No endpoint was sent during this audit. Extension tests establish expected behavior only if those tests are executed against their fixtures/runtime, not the deployed Directus instance.

## 10. API-to-Page Dependency Matrix

| Page/feature | Main client service(s) | Request families |
|---|---|---|
| Auth landing / reset / callback | `AuthService`, `PostLoginRoutingService` | `/auth/*`, `/users/register`, `/users/me`, email availability, `/auth/login/google`. |
| Shell / company selector | `CompanyContextService`, `WorkspaceContextApiService`, `AuthService`, notifications, heartbeat | `/users/me`, `/wellar/workspaces/context`, `/switch`, profile/business profile/member collections, notification collection, PATCH presence. |
| Dashboard | `DashboardService`, `OperationalDashboardService`, context service | `/items/${collection}` for configured metrics; context profile and role-dependent data. |
| Workforce | `WorkforceRosterApiService`, business center/admin | `/wellar/workforce`, member/profile/departments and invitation operations. |
| Requests | `OperationsWorkflowsService`, `BusinessCenterService` | `/wellar/scan-requests...`, `/items/requests`, request invites, workflow mutations. |
| Compliance | `ComplianceService` | `/items/departments`, wellness scans, scan results, consents. |
| Alerts | `OperationsWorkflowsService` | `/items/alerts`, `/wellar/alerts...`, notification and department collections. |
| Activity | `BusinessCenterService` | `/items/activity_events`, optional request/report-related data. |
| Reports | `ReportsService`, `ReportsPdfExportService` | `/items/${collection}` and report export records; local PDF. |
| Company | `OrganizationApiService`, `OrganizationService`, `BusinessCenterService` | `/wellar/organization*`, `/items/organization_members`, business profile, departments and members. |
| Invites / claim | `InviteService`, `OperationsAdminService`, `CompanyContextService` | `/wellar/workspaces/invites...`, optional Directus flow trigger, workspace context. |
| Settings / profile | direct HttpClient and `AuthService` | `/users/me`, PATCH `/users/me`, `/files`, protected file URL. |
| Delete account | `DeleteAccountComponent` direct HttpClient | POST `/wellar/account-deletion-requests`. |
| Mobile dashboard/requests/history/profile/audit | mobile components plus shared services | dashboard metrics; `/items/requests`, `/users/me`, `/files`, audit collection. |

## 11. Authentication and Authorization Flows

### Login / registration

`Authlanding` validates forms and invokes `AuthService`. Login POST returns no durable bearer token to JavaScript by design; session cookies are used. The service then obtains `/users/me`, checks that identity has an ID, persists identity display hints, and emits auth state. Signup POSTs `/users/register`; successful signup can continue to login or verification messaging. Google login is a redirect and returns to `/auth-callback`.

### Restore / refresh

`ensureSession()` is the shared session gate used by route guards and callback logic. It can use a current session or POST `/auth/refresh` with `{mode:'session'}` and credentials, then load `/users/me`. A sessionStorage marker suppresses repeated attempts when the refresh route appears absent. One helper wraps current-user restore with a 16-second timeout. Network/backend behavior and cookie attributes are unverified.

### Logout

Logout POSTs `/auth/logout`, prevents duplicate in-flight logout, resets auth identity, dispatches `wellar-auth-logout-complete`, and sends browser to `/`. Local identity and invite/workspace alias keys are removed. Actual server cookie invalidation depends on API response and cookie configuration.

### Authorization

`appAuthGuard` protects authenticated app shell; workspace guards require a server-verified active profile/membership; `activeRoleRouteGuard` restricts company/activity/settings/invites to owner/HR; employee guard blocks employees from operational routes and sends them to employee web access. `ownerWorkspaceGuard` has exceptions for requests and may route restricted views to dashboard. Normalization maps legacy role strings such as `admin → hr`, `member/viewer → employee`, and typo `manger → manager`.

These are client route/UI checks. The checked-in extension source documents server-side accountability and workspace membership/role checks for its own routes; Directus core collection permissions and complete deployment coverage cannot be verified. A user can bypass Angular guards with crafted HTTP requests unless backend policies enforce the same boundaries.

### Context switching

Workspace context is parsed from `/wellar/workspaces/context`; switching sends membership ID. Successful results replace active workspace/member/department state and browser storage. Auth-generation and context tests assert that late Company A identity/context results do not overwrite Company B state. The tests are source evidence only and were not run.

## 12. Data Models and State Management

Frontend DTO interfaces are spread across service/component files rather than a single generated API schema. Key types include `WorkspaceContextPayload` (active workspace, memberships, invitations), `WorkspaceContextWorkspace`, membership/department types, request/alert records, profile user and Directus user rows, report row generics, and UI view models. Many service boundaries use `any`, `unknown`, or permissive optional fields and normalize response envelopes locally. This tolerates provider response variation but weakens compile-time contract guarantees.

State is composed of component fields/signals, RxJS streams, service-held context snapshots, and browser storage. Workspace verified context has local persistence and revalidation behavior in `CompanyContextService`; settings preferences, theme, onboarding dismissals and invite/recovery markers use local/session storage. Mobile dashboard has a timestamped snapshot cache. No server-state cache framework or invalidation registry is visible.

Data relationships represented in UI include authenticated user ↔ workspace membership ↔ business profile/workspace ↔ department; role is associated with the active membership. Roster members and requests/scans/alerts/report records are scoped using query filters in some services. Authoritative relationships, database foreign keys, row-level security and tenant IDs cannot be established from frontend DTOs.

Client validation is present in forms (required fields, email/confirmation/password constraints and normalizers). It is not a replacement for backend validation. No general HTML sanitization library is listed; no obvious `innerHTML`/bypass sink was noted in inspected source/search. XSS safety still requires auditing all rendering paths and external links in a running application.

## 13. Background and Invisible Processes

| Process | Source behavior | Limits |
|---|---|---|
| Presence heartbeat | `PresenceHeartbeatService` starts interval while authenticated and PATCHes `/users/me`; clears interval on stop/logout/destroy. | Exact cadence in source; API availability and tab throttling unknown. This adds periodic requests. |
| Session refresh | Guard/callback shared session gate; refresh POST and `/users/me` lookup. | No general request retry; cookie endpoint behavior unverified. |
| Workspace context refresh | Context service may fetch once or force refresh, with timestamp cache-buster. | Route transitions can cause repeated refreshes; no browser waterfall measured. |
| Invite claim recovery | Query/session markers and pending token survive route changes/tab lifetime; resume/claim logic runs on app routes. | Session storage is per tab and URL token may be exposed in history/referrers unless deployment policy prevents it. |
| Email availability | Debounced/timer-based request and in-memory cache on auth landing. | Cache lifetime and backend rate limiting are implementation-defined; no server rate limit evidence. |
| Workspace activating / welcome | Poll/countdown/timers in page flows; welcome auto enters after five seconds. | Timers clear on destroy where implemented. API polling cadence must be confirmed per source before runtime claim. |
| Notifications | Shell/panel requests list/metadata and PATCHes state. | No WebSocket found; polling/subscription cadence depends on service lifecycle. |
| Mobile dashboard cache | `localStorage` snapshot + timestamp; stale cache fallback. | Browser-local, user-modifiable; not authoritative, may show stale metrics. |
| User preferences/onboarding | localStorage read/write; no server sync evidenced. | Device/profile specific and script-readable. |

No WebSocket, EventSource/SSE, service-worker synchronization, or cross-device cache synchronization was found in app sources searched.

## 14. Third-Party Services and Integrations

| Provider/library | Use / evidence | Unverified |
|---|---|---|
| Directus | Main REST/auth API origin; `/items`, `/users/me`, `/auth`, `/files`, `/flows/trigger`. | API version, schema, global permissions, cookies, CORS, installed flows. |
| Wellar custom routes | `/wellar/...` routes for workspace/workforce/operations/account deletion. | Backend route availability and deployed version. |
| Directus workspace extension | Source in `directus-extensions/wellar-workspaces/src/index.js`, README and tests, including workspace/invite/account deletion/protected-file operations. | Whether built/installed/enabled in current environment; production DB shape/permission config. |
| Google auth | Browser redirect through Directus Google login route. | OAuth app settings, redirect allowlist, provider responses. |
| Chart.js | Dashboard chart rendering. | Dataset size/performance in real sessions. |
| jsPDF/autotable | Client-side PDF creation. | Output fidelity at real data sizes. |
| Nginx / Docker | Static web deployment and SPA route fallback; security headers. | Actual deployed image, TLS edge/header behavior, CSP compatibility with runtime fonts/assets. |
| Fonts/CDN | Nginx CSP permits Google Fonts; CSS/source indicates remote font use. | Whether font requests succeed in deployment and privacy policy. |

No Wellar AI V2 provider, client, route, or dependency is identified in this audit.

## 15. Error Handling and Edge Cases

`mapSafeError` maps backend/network errors to safe user messages and is covered by unit tests. `AppError` types and UI error/empty/loading components provide shared patterns. Auth stores/consumes a safe auth notice. Workspace API has typed error codes for unauthorized, forbidden, not-found, conflict, server, network, invalid response and unknown; service applies 10-second timeout. Other APIs use local catch/finalize, typed/raw errors inconsistently.

Edge cases explicitly handled in source include missing auth refresh route, incomplete `/users/me` identity, invite tokens in query/hash/path, stale context responses across logout/switch, missing/invalid workspace context recovery, duplicate workspace creation lock, route access role normalization, and invite claim marker state. A number of catch blocks convert failure into null/default state; that can simplify UI recovery but may hide distinctions unless surfaced by page state.

No universal 401 refresh interceptor or 403 route handler exists. A 401 can be handled by the calling service/guard; no automatic write replay is performed. Network disconnect behavior, real CORS failures, rate limiting, server validation, concurrent tab races and partial writes require backend/browser testing.

## 16. Security and Tenant Isolation

### Positive controls observed

- API requests to configured origin send credentials and the interceptor strips caller Authorization values (`services/auth.interceptor.ts`).
- Authentication access token accessor returns no persisted bearer token; session mode is designed around cookie auth (`services/auth.ts`).
- App routing includes verified context/role checks and explicit employee operational route restrictions (`app.routes.ts`).
- The extension source checks request accountability, membership/role and workspace scope on its own route handlers; protected file route applies association checks (source and extension README/tests).
- Nginx source config specifies CSP, HSTS, frame denial, nosniff, referrer and permissions policy; fingerprinted assets are immutable and index is no-cache (`nginx.conf`).
- Safe error mapping is used for user-facing auth/backend errors.

### Findings and severity

| Severity | Finding | Evidence / impact |
|---|---|---|
| High verification risk | Directus collection authorization, row-level tenant isolation and server permission setup are outside repository. | Client services issue collection reads with query filters; frontend filters can be removed. Confirm Directus policies/RLS for every collection and route. |
| High verification risk | Cookie CSRF/CORS/SameSite/Secure/HttpOnly configuration is not checked in frontend. | Cross-origin credentialed writes to `dash.conntinuity.com`; extension Origin check does not prove all endpoints have equivalent protection. Validate API-wide CSRF policy and exact allowlist. |
| Medium | LocalStorage contains identity and active-workspace metadata. | `AuthService` and `CompanyContextService` persist user/workspace hints. These values are JS-readable/tamperable and must never authorize backend access. |
| Medium | Invite/reset/auth tokens can transit URL query/path and browser storage. | `app.ts`, auth landing, invite claim; URLs can persist in history/logs and be exposed through referrer depending policy. Minimize lifetime and verify redaction. |
| Medium | Many direct collection calls rely on query filters and broad limits. | Compliance, dashboard, report and operational service patterns. A missing or malformed tenant filter could expose cross-tenant data unless backend enforces scope. |
| Medium | File upload/download protections depend on API implementation. | `/files` upload and protected file loader; frontend type/size checks are bypassable. Verify server validation, associations and authorization. |
| Low/Medium | Client-side role labels/route guards may create misleading perceived security. | `activeRoleRouteGuard` is navigation protection only; do not treat it as access enforcement. |
| Low/Medium | CSP allows `img-src https:` and `style-src unsafe-inline`; config is source only. | Nginx policy broadens image trust and permits inline styles. Confirm actual served headers and necessity. |

Do not include real tokens, user data or credentials in logs/report output. No secrets were reproduced. Extension has a hardcoded-looking flow UUID in environment config; it is an identifier, not a secret, and was not copied here. Backend audit logs are not confirmed merely because audit-log UI exists.

## 17. Performance and Load-Test Readiness

**Client-side:** route-level lazy imports split many page chunks. Production budgets are 2 MB warning / 5 MB error initial bundle and 20/50 kB component style. Chart.js and jsPDF/autotable may contribute substantial chunks; actual built bundle sizes were not measured. Reports and PDF generation run client-side. Some large list views consume collection responses; pagination/limit behavior is service-specific. Mobile dashboard local caching can reduce perceived wait but serve stale data. Context/session requests can precede page API requests, adding waterfall steps.

**Requests/background:** workspace context can be fetched on guards and forced refresh; page/shell and feature services may repeat reads. Presence heartbeat is periodic. No WebSocket is used. No runtime network trace or duplicate request measurement was made. Request cancellation and deduplication are not globally standardized.

**Rendering/memory:** shared skeletons and table shells exist, but virtual scrolling was not found in routed list sources inspected. Large tables and chart recalculation may be bottlenecks; no profiling was run. RxJS subscriptions and timers must be lifecycle-bound; some components explicitly unsubscribe/clear timers while coverage across all pages is unverified.

**Backend capacity:** frontend code cannot establish API/database concurrency capacity. Do not infer a supported user count. Establish it later with isolated staging data and production-like infrastructure; define user journeys and tenant mixes; instrument API latency/error/DB pool/CPU/memory; test ramp, sustained, burst and recovery; validate rate limits and tenant isolation under load; monitor browser waterfalls and payload sizes. Never target production for load testing without authorization and a controlled plan.

## 18. Feature Completion Matrix

| Feature | Source assessment | Runtime status |
|---|---|---|
| Public marketing/legal pages | Implemented static component/template surfaces. | Content rendering/deployment unverified. |
| Login, signup, reset, OAuth callback | Frontend flows implemented with tests for selected paths. | Provider, email delivery, cookie and API result unverified. |
| Workspace context/switch/access | UI and typed service flows implemented; client lock/recovery logic present. | Backend availability/activation unverified. |
| Dashboard / operational charts | Data service and UI implemented. | Data correctness and API response unverified. |
| Workforce/department/member operations | Some routed workforce/company paths; legacy members/departments components exist. | Reachability differs; complete CRUD backend not established. |
| Requests and alerts | Routed UI and workflow services; tests assert mocked requests. | Server-side transition and permission behavior unverified. |
| Compliance | Routed page and data service; unit tests assert selected query behavior. | Real tenant scoping and source data unverified. |
| Reports/PDF | UI/service and export code present. | Large dataset correctness/output unverified. |
| Notifications | Panel and list/update service present. | Delivery/realtime behavior not established; no socket found. |
| Audit logs | Mobile legacy page and service code present; desktop alias redirects away. | Desktop reachability absent in declared route table; server audit generation unknown. |
| Account deletion | Public request form and extension route source. | It is a request flow; fulfillment/deletion not proven. |
| Workspace extension | Source, README and tests present. | Installation/activation in target Directus unknown. |
| Wellar AI V2 | No integration identified; explicitly out of scope. | Not applicable. |

“Implemented” means an implementation exists in source, not that the feature works in the deployed system.

## 19. Bugs, Risks and Technical Debt

1. **Role checks are duplicated and inconsistent by route.** Employee guard blocks a list of exact paths; owner/HR guard and ownerWorkspaceGuard have exceptions. Changes to route names can bypass intended client restrictions. Backend enforcement is essential.
2. **Audit log desktop access redirects to dashboard.** `/audit-logs` desktop route intentionally redirects; actual audit component is mobile-only. If desktop audit access is expected, it is not routed here.
3. **Several filesystem pages are not routed.** `/Pages/departments`, `/Pages/members`, `/Pages/company-setup`, `/Pages/history`, `/Pages/profile`, legacy layout and `/ia` components do not have direct route declarations in the inspected route table. Avoid representing these as reachable features without navigation proof.
4. **Endpoint response contracts are handwritten and heterogeneous.** Many `any`/`unknown` types and per-service parsers increase mismatch risk. No generated OpenAPI/client schema is visible.
5. **Potentially broad/unbounded list retrieval.** Generic collection fetchers and report/compliance/dashboard reads use query filters/limits; not every user flow demonstrates pagination. Large tenant data may increase latency/memory and amplify missed filters.
6. **Storage has mutable identity/context hints.** Client storage is suitable for display/cache, not authorization; stale/tampered values can create incorrect UI context.
7. **Cookie security and CSRF policy are unverified.** Cross-origin credentialed mutations make backend/proxy configuration a critical dependency.
8. **Static deployment config may differ from live edge.** Nginx security headers and cache policy are configured, but actual ingress/CDN overrides and TLS are unknown.
9. **Workspace extension activation is unknown.** Frontend points at custom routes; source presence and unit tests do not prove the deployed Directus extension matches.
10. **Existing tests are extensive but unexecuted here and mocked.** They establish intended contracts, not network integration or deployed authorization. E2E configuration presence is not evidence tests pass.
11. **No live monitoring/analytics integration identified in first-party source.** No Sentry/Datadog/GA SDK is declared in package dependencies. Production observability may be external, unavailable to this audit.
12. **Potential long-lived intervals/subscriptions require review.** Presence and page countdown/polling logic must be checked for complete lifecycle cleanup; visible welcome timers are cleared on destroy.

No product defects were modified or reproduced in a running app.

## 20. What Can Be Verified Offline

- Angular/TypeScript package ranges, build scripts, environment replacements, route declarations and guard code.
- URL templates, HTTP methods, local request bodies/queries, response parsing expectations, timeout and cache-buster logic.
- UI controls/templates and local validation/state transitions present in source.
- LocalStorage/sessionStorage keys and intended persistence behavior.
- Test assertions and fixture contracts (without claiming tests pass).
- Docker/Nginx source configuration.
- Directus extension source behavior, README claims and test fixtures (not whether deployed).
- Whether a Wellar AI V2 integration is present in inspected first-party web source: none identified.

## 21. What Requires Backend/Production-Like Testing

- Real endpoint existence, response types, API version compatibility, auth cookies, token refresh and logout invalidation.
- Directus permissions, tenant row-level policies, role enforcement, custom route availability, DB schema and extension installation.
- CORS, CSRF, cookie attributes, proxy behavior, CDN cache/security headers and TLS.
- Invite email delivery, Google OAuth, password reset/phone delivery, account deletion fulfillment and workspace activation.
- Upload limits/MIME validation, protected file authorization and audit-log generation.
- Error behavior for 401/403/404/409/429/5xx, network loss, timeouts, rate limiting and concurrent mutations.
- Full page rendering and keyboard/mobile behavior in supported browsers.
- API latency/waterfall, bundle artifact sizes, large-table rendering, memory, PDF limits and performance under representative data.
- Concurrent-user or throughput capacity; requires isolated production-like load testing and instrumentation.

## 22. Prioritized Recommendations

1. Verify Directus collection permissions and custom route authorization for every tenant-scoped collection/action; test cross-tenant reads and writes with at least two tenant identities in staging.
2. Document and validate API-wide cookie, CORS and CSRF policy for all credentialed state-changing endpoints, including the custom extension and proxy path.
3. Generate an API contract (OpenAPI or schema) and typed client for `/wellar/*` plus collection response contracts; reconcile `any`/`unknown`, response envelope and method mismatches.
4. Inventory every collection query’s tenant/member/department filter and backend policy; add bounded pagination and server-side filtering where datasets can grow.
5. Confirm deployed extension version/routes match checked-in extension source; run extension proof/tests in a safe staging environment.
6. Build a route-role matrix that pairs every route guard with authoritative backend enforcement and automatically tests employee/manager/HR/owner access outcomes.
7. Measure production build chunk sizes and browser waterfalls; profile dashboard/report/list views with representative large datasets and inspect polling/heartbeat load.
8. Confirm token/authorization-like URL parameters are short-lived and redacted from analytics, referrer, server/proxy logs and browser history; prefer fragment or one-time exchange where applicable.
9. Add integration/E2E coverage against disposable backend fixtures for auth restoration, company switching, invite claim, file access, request/alert workflows and failures.
10. Add operational telemetry for API latency/error rates, refresh failure, tenant-context mismatch and client exceptions, while avoiding personal data/secrets.

## 23. Unknowns and Unverified Assumptions

- No live host access was used, and no backend or production API calls were made.
- Whether `dash.conntinuity.com` is current, reachable, production, staging or tenant-isolated is not independently verified; it is the literal configured origin.
- The installed Directus version, custom extension version/activation, DB schema/constraints and access policies are unknown.
- Directus auth cookie attributes, CORS, CSRF defenses, OAuth providers and email/SMS delivery configuration are unknown.
- API endpoint response shapes are those expected by source parsers/tests, not confirmed live responses.
- Exact `~90 endpoint template` count depends on normalization of generic `${collection}` URLs and method/path suffix variants; route record count is source-counted. Reported endpoint number is approximate, not a guarantee of all runtime URLs.
- User-visible UI may depend on role, remote data, viewport, feature flags and CSS; screenshots/manual browser review were not performed.
- There may be endpoints composed dynamically beyond string searches or delegated through external scripts; the catalog is based on checked-in app TypeScript and extension evidence, not network capture.
- Presence cadence, page polling, list paging and all cleanup paths should be confirmed directly in a runtime profile before capacity decisions.

## 24. Source File Evidence Index

| Evidence area | Files / symbols |
|---|---|
| Bootstrap/config | `src/main.ts`; `src/app/app.ts:App`; `src/app/app.config.ts:appConfig`; `angular.json`; `package.json`; `tsconfig*.json`. |
| Routes/guards | `src/app/app.routes.ts:routes`, `appAuthGuard`, `businessOnboardingGuard`, `dashboardWorkspaceGuard`, `employeeWebOperationalGuard`, `activeRoleRouteGuard`, `ownerWorkspaceGuard`, `welcomeIntentGuard`, `appWelcomeMatcher`. |
| Environments | `src/environments/environment.ts`, `environment.development.ts`, `environment.prod.ts`; `proxy.conf.json`. |
| Auth/session | `src/app/services/auth.ts:AuthService`; `src/app/services/auth.interceptor.ts:AuthInterceptor`; `src/app/auth-callback/auth-callback.ts`; `src/app/public.layout/authlanding/authlanding.ts`; `src/app/public.layout/reset-password/reset-password.ts`. |
| Workspace/context | `src/app/core/context/company-context.service.ts:CompanyContextService`; `src/app/services/workspace-context-api.service.ts:WorkspaceContextApiService`; `workspace-creation.service.ts`; `workspace-applications.service.ts`; `workspace-activation.service.ts`. |
| Shell/navigation | `src/app/dashboard-shell/app-shell.component.*`; `sidebar/sidebar.component.*`; `topbar/topbar.component.*`; `select-company/select-company.component.*`; legacy `src/app/Layout/*`. |
| Feature pages | `src/app/Pages/dashboard/*`, `workforce/*`, `requests/*`, `compliance/*`, `alerts/*`, `reports/*`, `company/*`, `invites/*`, `invites-claim/*`, `settings/*`, `workspace-access/*`, `workspace-activating/*`, `workspace-request/*`, `workspace-restricted/*`, `employee-web-access/*`, `activity/*`. |
| Services/endpoints | `src/app/services/{dashboard,operational-dashboard,operations-workflows,operations-admin,operations-support,business-center,organization-api,organization,workforce-roster-api,compliance,reports,reports-pdf-export,notifications,invites,subscription}.service.ts` and related specs. |
| Mobile pages | `src/app/Pages/mobile/{dashboard-mobile,requests-mobile,history-mobile,profile-mobile,audit-logs-mobile}.component.ts` and matching templates/specs. |
| Shared error/file/notification | `src/app/shared/errors/{safe-error.mapper,app-error.types}.ts`; `src/app/shared/utils/protected-file-url.ts`; `src/app/shared/services/protected-avatar-loader.service.ts`; `src/app/shared/ui/global-notifications-panel/*`. |
| Background behavior | `src/app/core/presence/presence-heartbeat.service.ts`; `src/app/Pages/welcome/welcome.ts`; `src/app/components/new-user-guide/new-user-guide.ts`; `src/app/components/subscription-expiry-ads/subscription-expiry-ads.ts`. |
| Public/system pages | `src/app/public.layout/*`; `src/app/verifyemail/verifyemail.ts`; `src/app/Pages/not-found/not-found.ts`. |
| Deployment | `Dockerfile`; `nginx.conf`; `angular.json`; `proxy.conf.json`. |
| Server extension | `directus-extensions/wellar-workspaces/src/index.js`; `README.md`; `package.json`; `test/*.mjs`. |
| Non-app script | `server/fix-member-role-typo.js` (remote mutation utility; not executed). |
| Existing related docs | `WEB_SECURITY_AUDIT.md`, `WEB_PERFORMANCE_AUDIT.md`, `WEB_SCALABILITY_PLAN.md`, `FRONTEND_PRD_AUDIT.md`, `WEB_FIX_PRIORITY.md`; read as contextual prior documentation, not independent verification. |
