# Wellar AI Angular Frontend — PRD vs Actual Implementation

## 1. Executive Summary

The current Angular 21 application is a materially different and broader product than the v1.1 PRD describes. The strongest production-wired areas are organization context, organization profile and department administration, the Workforce roster, scan-request creation and queueing, operational dashboard aggregation, compliance evidence, alert workflow actions, client-side reports, persistent notifications, authentication, invitations, and workspace onboarding/switching.

The implementation is not uniformly complete. Billing is a façade over workspace access rather than a subscription system; no Stripe checkout or portal exists. The PRD's AI-baseline UI and browser-side scan capture/analysis are absent. The Compliance screen computes real coverage from backend records but does not provide the PRD's individual or bulk request actions and has no dedicated seven-day chart. Several older desktop and mobile components remain in source but are not routed, or use legacy collections. Some authorization is enforced by Angular guards and scoped backend endpoints, but the main operational routes rely on a broad employee-blocking guard rather than a per-route Owner/HR/Manager role guard; frontend RBAC must not be treated as backend security.

Audit basis: the detailed Wellar AI PRD v1.1 requirements supplied with the audit request. No separate PRD attachment was present in the repository. Repository planning documents were treated as implementation notes, not proof. A feature was credited only where a route or reachable UI invokes real code and, when applicable, an HTTP operation.

Status totals below count the 58 independently assessed rows in the feature matrix: **Implemented 22; Partial 8; Missing 10; Changed 9; Extra 7; Dead/Unused 2; Unclear 0.**

## 2. PRD Feature Matrix

| PRD Feature | Expected Behavior | Actual Implementation | Status | Evidence |
| --- | --- | --- | --- | --- |
| Company setup | User creates/configures a company | Authenticated users without a workspace use Organization Access and a protected workspace-create flow; account-team application flow also exists | CHANGED | `/app/workspace-access`, `/app/workspace/request`; `WorkspaceCreationService`, `WorkspaceApplicationsService` |
| Company profile | View/edit company details | Owner/HR Organization page loads and patches profile through protected organization API | ✅ IMPLEMENTED | `app.routes.ts`; `Pages/company/company.ts`; `OrganizationApiService.updateProfile()` |
| Company dashboard | Organization overview | Aggregated live workspace/member/request/scan/result/alert data with KPI and attention sections | ✅ IMPLEMENTED | `/app/dashboard`; `Dashboard`; `OperationalDashboardService` |
| Company-wide scan history | Dedicated scan history | No desktop history page; recent scans and trends are distributed across Dashboard, Compliance and Reports. Touch-only legacy History exists | PARTIAL | history redirect in `app.routes.ts`; `dashboard.html`; `compliance.html`; `reports.html` |
| Scan requests system | Create and track requests | Real protected create endpoint, eligible-recipient modal, duplicate blocking, queue/filter/status UI | ✅ IMPLEMENTED | `/app/scan-requests`; `RequestsPageComponent`; `POST/GET /wellar/scan-requests` |
| Export center | Export job center/history | Reports page creates local CSV/PDF downloads; not a backend export-job center in the routed UI | CHANGED | `/app/reports`; `ReportsService.exportReportsCsv()`; `ReportsPdfExportService` |
| Activity logs | Company activity log | `/app/activity` loads `activity_events`; separate `audit_logs` implementation is touch-only/legacy | CHANGED | `ActivityPageComponent`; `OperationsSupportService`; `AuditLogsMobileComponent` |
| Basic analytics | KPIs and trends | Dashboard, Compliance and Reports compute KPIs, readiness distribution, compliance and request trends from backend data | ✅ IMPLEMENTED | `OperationalDashboardService`; `ComplianceService`; `ReportsService` |
| Employee directory | Employee list/table | Renamed and broadened to Workforce, combining active, attention, inactive and invited people | CHANGED | `/app/workforce`; `WorkforcePageComponent`; `GET /wellar/workforce` |
| Search employees | Search directory | Name, email and department search is wired client-side over returned roster | ✅ IMPLEMENTED | `workforce.ts:350-368`; `workforce.html` |
| Filter by risk level | Risk filter | No dedicated Workforce risk-level filter; filters are role, department, eligibility and today's scan state | ❌ MISSING | `WorkforceFilters` and `filteredRows` in `workforce.ts` |
| Filter by scan status | Scan-status filter | Today's scan filter supports completed, pending/requested and missing states | ✅ IMPLEMENTED | `workforce.ts:1506-1513`; `workforce.html` |
| Add employee | Direct add employee form | Onboarding is invitation-based; owner/HR sends invite with role and department | CHANGED | Workforce/Invitations UI; `POST /wellar/workspaces/invites` |
| Edit employee | Edit employee record | Role and department are editable; no general employee identity/profile editor | PARTIAL | `saveRole()`, `saveDepartment()` in `workforce.ts` |
| Deactivate employee | Deactivate membership | Real deactivation action through operations admin service | ✅ IMPLEMENTED | `requestDeactivate()`/confirmation in `workforce.ts`; `deactivateMember()` |
| Deactivation confirmation | Confirm destructive action | Confirmation state/dialog precedes deactivation | ✅ IMPLEMENTED | `workforce.ts:775-892`; `workforce.html` |
| Role badge | Display employee role | Shared role badge and roster role labels are used | ✅ IMPLEMENTED | `shared/ui/role-badge`; Workforce and sidebar templates |
| Department selector | Assign employee department | Invite, role/department edit, filters and company department manager selector are wired | ✅ IMPLEMENTED | `workforce.ts`; `company.html`; Operations admin API |
| Route guards by role | Protect routes by role | Auth/workspace/employee guards exist; Company, Invites, Activity, Settings use Owner/HR guard. Workforce, Requests, Compliance, Alerts and Reports only block Employee and depend on backend scoping | PARTIAL | guards in `app.routes.ts:342-480`; route definitions `667-739` |
| Owner / Manager / Employee permissions | Three PRD roles | Four active roles: Owner, HR, Manager, Employee. HR largely mirrors Owner; Manager is department scoped; Employee is redirected out of admin shell | CHANGED | `ia/wellar-ia.ts`; route guards; service scope assertions |
| Departments management page | Standalone department page | Real management is embedded as Organization > Departments; old standalone component has no route | CHANGED | `/app/company?tab=departments`; `CompanyPageComponent`; `Pages/departments` unused |
| Create department | Create | Protected POST is invoked by Organization page | ✅ IMPLEMENTED | `OrganizationApiService.createDepartment()` |
| Rename department | Rename/edit | Protected PATCH updates name and optional manager | ✅ IMPLEMENTED | `OrganizationApiService.updateDepartment()` |
| Delete department | Delete | Product intentionally deactivates rather than deletes and blocks unsafe deactivation | CHANGED | `POST /wellar/organization/departments/:id/deactivate` |
| Employee count/department | Show count | Active member count is calculated and displayed per department | ✅ IMPLEMENTED | `company.ts:389-392`; `company.html:221-237` |
| Average readiness/department | Department readiness metric | Organization department table does not show it; Reports has broader department performance | PARTIAL | `company.html`; `ReportsService.computeDepartmentPerformance()` |
| Today's compliance/department | Department compliance | Department coverage rows contain eligible, completed, missing, rate and alerts | ✅ IMPLEMENTED | `ComplianceService.buildDepartmentCompliance()`; `compliance.html` |
| Manager department scope | Manager sees assigned department | Context and data services assert/filter manager department; missing scope produces explicit unavailable state | ✅ IMPLEMENTED | `CompanyContextService`; `ComplianceService`; `OperationsWorkflowsService`; Dashboard/Workforce pages |
| Compliance page | KPIs and monitoring | Real organization/department coverage view with loading, permission, partial-data and error states | ✅ IMPLEMENTED | `/app/compliance`; `CompliancePageComponent`; `ComplianceService` |
| Missing employee list | Name, department, last scan | Exceptions table includes member/department/current scan/readiness/request/alert state and scan evidence | ✅ IMPLEMENTED | `ComplianceExceptionRow`; `compliance.html` |
| Individual Send Request | Send from missing row | No request action is wired in the current Compliance component | ❌ MISSING | `Pages/compliance/compliance.ts` has no workflow service/action |
| Request All Missing | Bulk action | A legacy service signature exists but discards all arguments and returns without an HTTP call; current page does not call it | ❌ MISSING | `operations-workflows.service.ts:978-983`; `compliance.ts` |
| 7-day compliance chart | Seven-day chart/history | Date-range filtering and report trends exist, but no dedicated 7-day chart on Compliance | PARTIAL | `ComplianceFilters`; `reports.html`; no chart in `compliance.html` |
| Alert Center | Alert queue | Backend alert list, filters, KPI counts, detail drawer and action states | ✅ IMPLEMENTED | `/app/alerts`; `AlertsPageComponent`; `OperationsWorkflowsService` |
| Alert fields/color | Employee, time, severity/risk | Normalized employee/department/scan/result details and severity/status styling are rendered | ✅ IMPLEMENTED | `alerts.ts`; `alerts.html`; alert detail loaders |
| Mark Reviewed | Persist review | Protected alert workflow POST supports start review, mark reviewed and resolve, then refreshes UI | ✅ IMPLEMENTED | `POST /wellar/alerts/:id/workflow`; `alerts.ts` |
| Unreviewed indicator | Badge in navigation | Alert page counts unreviewed, but sidebar has no Alerts count; topbar badge counts unread notifications instead | PARTIAL | `alerts.ts:165-173`; `SIDEBAR_NAV`; `TopbarComponent` |
| New-alert toast | Realtime in-app toast | No push/SSE/WebSocket or new-alert toast was found | ❌ MISSING | no realtime transport or alert-toast integration in `src/app` |
| Alert refresh behavior | Realtime/polled | Alerts refresh on page actions/manual reload; notifications refresh on context/panel/manual events. No interval polling | PARTIAL | `AlertsPageComponent`; `NotificationsService.initialize()/refresh()` |
| Current tier | Real subscription tier/status | Subscription service derives `business/free` solely from workspace existence and synthesizes “Active” | ❌ MISSING | `subscription.service.ts:54-108` |
| Seat usage | Used vs limit | No wired seat-usage/quota UI | ❌ MISSING | no seat calculation in routed pages/services |
| 80% warning / limit upgrade | Enforce quota | No real quota enforcement or warning | ❌ MISSING | subscription façade and routed pages |
| Pricing page | Public pricing | Static public Enterprise Pilot pricing page exists | EXTRA | `/pricing`; `PricingComponent` |
| Checkout / Stripe / portal | Self-service billing | No checkout, Stripe redirect, success/cancel, renewal, cancellation or portal flow | ❌ MISSING | `/payment` aliases account-team-managed `UpgradePlanComponent`; no Stripe code |
| Manager dashboard | Required manager KPIs/actions | Same Dashboard adapts to Manager department context and includes compliance, scans, average readiness, high risk, alerts, attention, requests and activity with CTAs | ✅ IMPLEMENTED | `Dashboard`; `OperationalDashboardService`; `dashboard.html` |
| Employee dashboard/experience | Employee landing | Employees are routed to a web-access explanation/download surface, not a functional readiness dashboard | CHANGED | `/employee-web-access`; `resolveWorkspaceLandingRoute()` |
| Personal baseline state | Active/building X/7 | No baseline/calibration data or UI; “baseline” occurrences in Company are form dirty-check variables | ❌ MISSING | repository-wide baseline search; `company.ts` variables are unrelated |
| Browser scan/AI capture | Camera, voice, reaction, processing | Admin web consumes stored scan/results; it does not capture camera/audio/reaction tasks or run AI | ❌ MISSING | no media capture APIs; data readers in dashboard/compliance/reports |
| Workspace context/switching | Not in PRD | Multi-workspace discovery, active membership, switching, recovery and role-specific landing are fully wired | EXTRA | `CompanyContextService`; `WorkspaceContextApiService`; sidebar switcher |
| Invitation lifecycle | Not in PRD Angular scope | Send, list, resend, expire/revoke, accept/decline and token claim flows | EXTRA | `/app/invites`, `/invites/claim`; Invite/OperationsAdmin services |
| Workspace applications | Not in PRD | Request organization setup, track status, resubmit requested changes and admin-reviewed lifecycle | EXTRA | `/app/workspace/request`; `WorkspaceApplicationsService` |
| Persistent notifications | Beyond alert toast | Backend notification bell/panel, unread count, optimistic mark-read with rollback and deep links | EXTRA | topbar; `GlobalNotificationsPanelComponent`; `NotificationsService` |
| Account deletion request | Privacy workflow | Public confirmed request posts to protected custom endpoint; staff deletion remains manual | EXTRA | `/delete-account`; `POST /wellar/account-deletion-requests` |
| Account preferences/profile | Personal settings | Owner/HR account settings supports profile/avatar, local UI preferences, security/session and workspace cache controls | EXTRA | `/app/settings`; `SettingsPageComponent` |
| Auth/recovery | Product infrastructure | Email/password, signup, Google OAuth, verify email, password reset, refresh-cookie and logout flows | ✅ IMPLEMENTED | public/auth routes; `AuthService`; `AuthInterceptor` |
| Consent/privacy acknowledgement | Consent before first scan | Web compliance code can read consent records in an older workflow service, but no first-scan consent UI is reachable in this Angular web app | PARTIAL | `OperationsWorkflowsService`; no routed scan UI |
| Legacy desktop/mobile pages | Older duplicate UX | Several components have no route or are shadowed/redirected; some touch-only pages use legacy `requests`/`audit_logs` collections | ⚪ DEAD / UNUSED | `Pages/members`, `Pages/departments`, `Pages/profile`, `Pages/company-setup`, mobile routes |
| Placeholder shell/page code | Placeholder route surfaces | `DashboardPlaceholderPageComponent` and `MyReadinessPageComponent` exist but are never loaded; `/app/my-readiness` redirects away | ⚪ DEAD / UNUSED | `dashboard-shell/placeholder-page`; `Pages/my-readiness`; `app.routes.ts` |

## 3. Existing Capabilities Verification

### Company setup and profile

- Reachability: `/app/workspace-access` is authenticated workspace recovery/creation; `/app/company` is guarded by auth, verified workspace, Employee exclusion and Owner/HR role.
- Components/forms: `WorkspaceAccessPageComponent` validates organization creation fields. `CompanyPageComponent` has editable organization name, timezone and language plus department administration.
- Services/APIs: `WorkspaceCreationService` posts `/wellar/workspaces/create`; `OrganizationApiService` gets `/wellar/organization` and patches `/wellar/organization/profile`.
- States: both flows include loading, validation, permission/no-context and backend error states.
- Verdict: setup is **CHANGED** to a workspace/membership model; profile administration is **✅ IMPLEMENTED**.

### Dashboard / overview and analytics

`/app/dashboard` is reachable for Owner, HR and Manager through role-aware navigation. `OperationalDashboardService.getDashboardData()` loads real records and produces Compliance Today, Scans Today, Avg Readiness, High Risk and Open Alerts KPIs, readiness distribution, department compliance, attention items, scan activity, alert previews and pending requests. Manager copy and queries use assigned-department context. Section-level errors are retained rather than converted into fake zeroes. This is **✅ IMPLEMENTED**.

### Scan history

There is no routed desktop company-wide History page: `/history` redirects to `/app/dashboard`. Recent scan evidence exists in Dashboard and Compliance, while Reports provides date-ranged trends and exported detail. A touch-only `HistoryMobileComponent` is reachable only when the viewport is narrow and touch-capable. The PRD's dedicated scan-history capability is therefore **PARTIAL**.

### Scan requests

`/app/scan-requests` is a first-class sidebar route. The page loads a server-built queue using `GET /wellar/scan-requests`, obtains verified eligible members, and creates via `POST /wellar/scan-requests`. It blocks duplicate open requests and displays pending/completed/overdue/expired/cancelled/failed states with loading, empty and error UI. Workforce “Send scan request” navigates to this page with a preselected member rather than firing silently. **✅ IMPLEMENTED**.

### Export center, activity logs and analytics

- Reports is a real analytics/export surface, but CSV and PDF are generated in-browser. It is **CHANGED** from a backend export center/job history.
- `/app/activity` reads `activity_events` and supplies filters and paging. It is **CHANGED** from the older `audit_logs` implementation, whose desktop route redirects away.
- Dashboard/Compliance/Reports analytics are **✅ IMPLEMENTED**, subject to backend collection permissions and the partial-data warnings explicitly exposed by their services.

## 4. Employee Directory & RBAC

The actual directory is **Workforce** at `/app/workforce`. It uses `GET /wellar/workforce` for a server-scoped roster and combines membership/invitation/request/readiness state. Tabs distinguish active, needs-attention and inactive rows. Search, role, department, eligibility and today's-scan filters are implemented. The exact PRD risk-level filter is absent.

Owner/HR can invite, edit roles, assign departments and deactivate. Manager UI is scoped to an assigned department and does not expose invitation administration. Employee is redirected to `/employee-web-access`. Add Employee is invitation-first rather than direct record creation.

The active role contract is `owner | hr | manager | employee`; `manger` is normalized to Manager, `admin` is normalized to HR in route compatibility code, and `member`/`viewer` normalize to Employee. **HR is a CHANGED/added product role**, with nearly Owner-equivalent operational access. “Admin”, “member”, “viewer”, and misspelled “manger” are compatibility aliases, not separately surfaced roles.

RBAC evidence:

- UI visibility: `SIDEBAR_NAV` filters by active member role; Workforce action predicates separately constrain role/department/invite actions.
- Route protection: `ownerHrRouteGuard` protects Organization, Invitations, Activity and Settings. `employeeWebOperationalGuard` blocks Employee from operational pages.
- Limitation: Dashboard, Workforce, Scan Requests, Compliance, Alerts and Reports do not use a positive allow-list route guard for Owner/HR/Manager. They block Employee and rely on verified workspace context plus backend endpoint/collection permissions. Hiding a button is not counted as security; backend authorization is outside the scope of this frontend audit.

## 5. Departments & Teams

The product still uses **departments**, not teams/groups. Management is embedded in `/app/company` under a Departments tab. Owner/HR can create, edit/rename, assign an Owner/HR/Manager as department manager, and deactivate with a confirmation panel. The custom API rejects unsafe deactivation when active members remain. Counts are displayed; permanent deletion is not offered.

The compliance area calculates department eligible members, completed/missing scans, compliance rate and open alerts. Average readiness is not on the Organization department table. Manager service queries assert an active department and filter to it. The older standalone `DepartmentsPageComponent` has no route and must not be used as evidence of shipped behavior.

## 6. Compliance Monitoring

`/app/compliance` is backend-wired through `ComplianceService`, using the verified Workforce roster plus `departments`, `wellness_scans`, `scan_results`, alerts and request data. It independently presents:

- coverage rate, completed and missing counts;
- department breakdown with color/tone states;
- exception list with member, department, scan status, readiness and alert/request context;
- recent compliance evidence;
- Today, last 7 days and last 30 days filters;
- explicit degraded/permission/data-quality warnings.

Differences: there is no Compliance-page individual “Send Request”, no wired “Request All Missing”, and no dedicated seven-day chart. The no-op legacy `requestAllMissing()` is specifically not an implementation. Last scan is represented through evidence/current state rather than exactly matching the PRD's row design.

## 7. Alerts & Notifications

The Alert Center is real. `GET /items/alerts` is workspace/department filtered, detail loading joins scan results and related records, and `POST /wellar/alerts/:id/workflow` persists `start_review`, `mark_reviewed`, and `resolve`. The page applies severity and status colors and refreshes after workflow actions.

The shell also contains a separate persistent notification system. It introspects `/fields/notifications`, queries `/items/notifications`, scopes results to workspace/user when supported, shows a topbar unread badge, deep-links alert notifications, and optimistically PATCHes read state with rollback on failure. This is broader than the PRD alert badge.

There is no timer, WebSocket, SSE, push subscription or toast for newly arrived alerts. Refresh occurs on context change, panel/component opening, explicit refresh and action completion. The sidebar itself carries no numeric alert indicator.

## 8. Subscription / Billing

No production billing system is implemented.

`SubscriptionService.getPlans()` returns `of([])`. It derives `planCode` from whether a workspace exists, hardcodes trials as false, and synthesizes an Active monthly subscription. `activatePlan()` and trial methods merely return the same synthesized state. `BusinessUpgradeService` always returns `{ok:false}`. `/payment` and `/upgrade-plan` render the same account-team-managed activation message. No Stripe SDK/API, checkout session, success/cancel route, billing portal, cancellation, renewal, seat counter, 80% warning, quota enforcement or Business Center quota was found.

The static `/pricing` marketing page is **EXTRA**. It is not checkout.

## 9. Role-Specific Dashboards

| Role | Landing | Navigation / pages | Dashboard and actions | API scope |
| --- | --- | --- | --- | --- |
| Owner | `/app/dashboard` | All sidebar pages plus Organization, Invitations, Activity, Settings | Organization KPIs, attention, requests, alerts, compliance, reports; organization/workforce administration | Active workspace |
| HR | `/app/dashboard` | Nearly Owner-equivalent; HR is not in PRD v1.1 | Same operational dashboard and most administrative actions | Active workspace |
| Manager | `/app/dashboard` | Dashboard, Workforce, Scan Requests, Compliance, Alerts, Reports | Same component with assigned-department copy/data; no Organization/Invites/Settings/Activity nav | Active department asserted by data services |
| Employee | `/employee-web-access` | No admin sidebar | Web-access/download guidance only; no dashboard widgets or scan actions | Verified membership context only |

The Manager KPI set substantially matches the PRD: Compliance Today, High Risk, Avg Readiness, Open Alerts, attention items, missing/not-scanned workers, recent scans/activity and quick links. “Send Scan Request” routes to the dedicated request workflow.

## 10. AI/Baseline UI

No personal baseline, calibration state, “Personal baseline active,” or “Building baseline (X/7 scans)” UI/model/API integration was found. Variables named `profileBaseline` and `departmentFormBaseline` in `company.ts` are string signatures used to detect unsaved form changes and are unrelated to AI baselines. Status: **❌ MISSING**.

## 11. Scan & Readiness Features

The web dashboard consumes, correlates and displays backend-produced scan evidence:

- `wellness_scans` completion timestamps;
- `scan_results` risk level, readiness score, confidence and explanation where permissions/schema allow;
- Stable, Low Focus, Elevated Fatigue and High Risk classifications;
- alert explanations/suggested actions and request lifecycle status;
- readiness distribution, average readiness, trends and exported reports.

It does not implement camera capture, face analysis, audio/voice capture, reaction/focus tests, browser AI processing or upload/processing progress. Touch-only history shows a recommendation field but is not proof of analysis execution. The Angular app is an operational consumer of AI results, not the scan client.

## 12. Workspaces / Invitations / Workforce

Actual product workflow:

1. Authentication establishes a Directus session and loads `/wellar/workspaces/context`.
2. A user can select/switch an existing membership using `POST /wellar/workspaces/switch`, claim a token invitation, or create/request an organization.
3. Owners/HR send role/department invitations using `POST /wellar/workspaces/invites`; invitees inspect, accept or decline via `/wellar/workspaces/invites/:id[/accept|decline]` and `/invites/claim`.
4. The Workforce route reads the protected `/wellar/workforce` roster; management mutations use the operations admin service/custom extension endpoints.
5. Users with multiple organizations can switch from the sidebar; context changes reload page data and notifications.

Workspace application records (`workspace_applications`) support submit, read status, update/resubmit and approved/rejected/changes-requested displays at `/app/workspace/request`. This is a significant **EXTRA** workflow beyond v1.1.

## 13. Privacy & Access Control UI

- Consent before first scan: not implemented in this web app. A backend consent collection is referenced by older operational workflow aggregation only.
- Privacy acknowledgement: public Privacy, Terms and Security pages exist; no proven first-scan acknowledgement gate.
- Data deletion: `/delete-account` validates email, optional reason and explicit confirmation, then posts `/wellar/account-deletion-requests`. It requests manual processing; it does not directly delete records.
- Sensitive visibility: Employee cannot enter the admin shell. Manager queries are department-scoped in service logic. Owner-only raw-media visibility is declared in planning/types but no raw-media UI was found.
- Session handling: auth interceptor restricts bearer attachment to the configured API origin, rejects invite-like credentials as auth tokens, clears expired tokens, and logout/refresh flows exist. One caveat is that an expired request is retried once without the Authorization header rather than transparently refreshed.
- Owner removal: membership deactivation is available; direct deletion of employee data is not.

These are frontend observations only and do not establish backend security.

## 14. Features Added Outside the PRD

### FEATURES IMPLEMENTED AFTER / OUTSIDE PRD

| Feature | What it does / role | Routes | Main files | Backend APIs | Production readiness |
| --- | --- | --- | --- | --- | --- |
| HR role | Owner-like operational/admin role with organization-wide scope | Admin shell routes | `ia/wellar-ia.ts`, guards, page predicates | All scoped operational APIs | Wired; update PRD role model |
| Multi-workspace access/switcher | Discover, select, switch and recover active organization membership | `/app/workspace-access` | `CompanyContextService`, sidebar, `WorkspaceContextApiService` | `GET /wellar/workspaces/context`, `POST /wellar/workspaces/switch` | Wired with loading/error/recovery |
| Workspace creation | Creates organization and active membership | `/app/workspace-access` | `WorkspaceAccessPageComponent`, `WorkspaceCreationService` | `POST /wellar/workspaces/create` | Wired |
| Workspace setup applications | Submit and track account-team approval workflow | `/app/workspace/request` | `workspace-request.ts`, `WorkspaceApplicationsService` | CRUD `workspace_applications` | Wired; operational dependency on staff review |
| Invitation lifecycle/claim | Send, resend, expire/revoke, inspect, accept, decline and claim invites | `/app/invites`, `/invites/claim` | Invites pages; `InviteService`; `OperationsAdminService` | `/wellar/workspaces/invites...` | Wired |
| Persistent notifications | Unread badge, panel, mark-read persistence and alert deep link | Global topbar | `NotificationsService`, `GlobalNotificationsPanelComponent` | `GET/PATCH /items/notifications`, `GET /fields/notifications` | Wired but not realtime/polled |
| Account deletion request | Public privacy request with consent checkbox | `/delete-account` | `DeleteAccountComponent` | `POST /wellar/account-deletion-requests` | Wired; manual fulfillment |
| Public product site/auth modal | Marketing, pricing, policies, contact, download and modal login/signup | `/`, `/pricing`, `/privacy`, etc. | `public.layout/*` | Auth endpoints where applicable | Mixed: content is static, auth is wired |
| Personal account settings | Profile/avatar, preferences, security/session and local context reset | `/app/settings` Owner/HR | `SettingsPageComponent` | `GET/PATCH /users/me`, files upload | Wired; preferences are browser-local |
| Client-side PDF/CSV reporting | Generates downloadable operational reports without export jobs | `/app/reports` | `ReportsService`, `ReportsPdfExportService` | Reads operational collections; download is local | Wired; differs from export-center model |

## 15. Partial / Broken / Dead Features

- `SubscriptionService`, `BusinessUpgradeService`, and the payment routes are compatibility façades/stubs, not billing.
- `OperationsWorkflowsService.requestAllMissing()` is a no-op (`void` arguments; no HTTP request).
- `AuthService.requestPhoneOtp()` and `verifyPhoneOtp()` explicitly label their endpoints placeholders for a future OTP driver.
- `AuditLogsComponent` has placeholder hooks for create-log/detail UX. Desktop `/audit-logs` redirects away.
- `DashboardPlaceholderPageComponent`, `MyReadinessPageComponent`, `MembersPageComponent`, standalone `DepartmentsPageComponent`, desktop `Profile`, `CompanySetup`, and `BusinessCenterMobileComponent` are not loaded by the active route table.
- Touch-only legacy pages are reachable only under `canMatch` viewport/touch checks. Some reference `/business-center`, but no such route exists; the authenticated `/app/business-center` path merely redirects to Dashboard.
- Touch `RequestsMobileComponent` calls legacy `/items/requests`, while the current desktop workflow uses `/wellar/scan-requests`; this is schema/workflow drift.
- Reports does not create, poll, retry or download backend `reports_exports` jobs in the routed component, despite unused support-service methods for that model.
- Notifications are refresh-driven, not realtime. There is no “Mark all read” in the active `NotificationsService` surface.
- Route metadata declares more granular access than the actual route guards enforce for several operational routes.
- Repository planning documents describe components/services that do not exactly match the final file layout; those documents are not proof of implementation.

## 16. Frontend API Inventory

Dynamic Directus queries commonly retry with reduced field sets when a field is unavailable. Rows below group repeated query variants but list every meaningful endpoint family found in production Angular source.

| Angular Feature | HTTP Method | Endpoint | Service/File | Used By Page | Status |
| --- | --- | --- | --- | --- | --- |
| Login | POST | `/auth/login` | `services/auth.ts` | Landing auth modal | ✅ IMPLEMENTED |
| Signup | POST | `/users/register` | `services/auth.ts` | Landing auth modal | ✅ IMPLEMENTED |
| Password reset request | POST | `/auth/password/request` | `services/auth.ts` | `/reset-password` | ✅ IMPLEMENTED |
| Password reset | POST | `/auth/password/reset` | `services/auth.ts` | `/reset-password` | ✅ IMPLEMENTED |
| Phone OTP | POST | `/auth/phone/request`, `/auth/phone/verify` | `services/auth.ts` | Legacy auth code | PARTIAL — explicitly placeholder endpoints |
| Google login | Browser redirect | `/auth/login/google` | `services/auth.ts` | Landing auth modal | ✅ IMPLEMENTED |
| Session refresh/logout | POST | `/auth/refresh`, `/auth/logout` | `services/auth.ts` | Global auth/session | ✅ IMPLEMENTED |
| Current user/profile | GET/PATCH | `/users/me` | Auth, context, Settings, Profile, presence services | Global/settings | ✅ IMPLEMENTED |
| User/avatar compatibility | GET/PATCH/POST | `/users/:id`, `/files`, `/files/:id` | Profile/Settings/mobile Profile | Settings; some legacy pages | PARTIAL — active Settings plus unused duplicate Profile pages |
| Workspace context | GET | `/wellar/workspaces/context` | `WorkspaceContextApiService`, `CompanyContextService` | Guards/shell/all app pages | ✅ IMPLEMENTED |
| Switch workspace | POST | `/wellar/workspaces/switch` | `WorkspaceContextApiService` | Sidebar/workspace access | ✅ IMPLEMENTED |
| Create workspace | POST | `/wellar/workspaces/create` | `WorkspaceCreationService` | Workspace Access | ✅ IMPLEMENTED |
| Workspace invite claim | POST | custom claim endpoint configured by environment | `InviteService.claimInvite()` | `/invites/claim` | ✅ IMPLEMENTED |
| Invite detail | GET | `/wellar/workspaces/invites/:id` | `InviteService` | Invite claim/access | ✅ IMPLEMENTED |
| Accept/decline invite | POST | `/wellar/workspaces/invites/:id/accept|decline` | `InviteService` | Invite access/claim | ✅ IMPLEMENTED |
| Invite administration | POST | `/wellar/workspaces/invites` | `OperationsAdminService` | Workforce/Invitations | ✅ IMPLEMENTED |
| Workspace applications | GET/POST/PATCH | `/items/workspace_applications[/:id]` | `WorkspaceApplicationsService` | Workspace Request/Access | ✅ IMPLEMENTED |
| Organization aggregate | GET | `/wellar/organization` | `OrganizationApiService` | Organization | ✅ IMPLEMENTED |
| Organization profile | PATCH | `/wellar/organization/profile` | `OrganizationApiService` | Organization | ✅ IMPLEMENTED |
| Departments | POST/PATCH | `/wellar/organization/departments[/:id]` | `OrganizationApiService` | Organization | ✅ IMPLEMENTED |
| Deactivate department | POST | `/wellar/organization/departments/:id/deactivate` | `OrganizationApiService` | Organization | ✅ IMPLEMENTED |
| Workforce roster | GET | `/wellar/workforce` | `WorkforceRosterApiService` | Workforce; dashboard/admin aggregation | ✅ IMPLEMENTED |
| Membership records | GET/POST/PATCH | `/items/business_profile_members[/:id]` | Context, OperationsAdmin, BusinessCenter services | Workforce/context; some legacy services | ✅ IMPLEMENTED for active consumers |
| Business profiles | GET/POST | `/items/business_profiles` | Context, OperationsAdmin, BusinessCenter | Context/dashboard/legacy setup | PARTIAL — POST belongs to older flow; active creation uses custom endpoint |
| Department records | GET | `/items/departments` | Context/dashboard/compliance/reports/workflows | Multiple operational pages | ✅ IMPLEMENTED |
| Scan request queue/create | GET/POST | `/wellar/scan-requests` | `OperationsWorkflowsService` | Scan Requests | ✅ IMPLEMENTED |
| Legacy requests | GET/POST/PATCH | `/items/requests[/:id]` | BusinessCenter, mobile Requests | Touch/legacy components | ⚪ DEAD / UNUSED or legacy drift |
| Request invites legacy | GET/POST | `/items/request_invites` | `BusinessCenterService` | Legacy business-center flows | ⚪ DEAD / UNUSED in active desktop app |
| Shift templates | GET/POST | `/items/shift_templates` | Dashboard/workflows/support | Dashboard/operations aggregation | PARTIAL — reads are active; creation is not exposed by current routed pages |
| Wellness scans | GET | `/items/wellness_scans` | Dashboard/Compliance/Reports/Workflows | Dashboard/Compliance/Reports | ✅ IMPLEMENTED |
| Scan results | GET | `/items/scan_results` | Dashboard/Compliance/Reports/Workflows | Dashboard/Compliance/Alerts/Reports | ✅ IMPLEMENTED with degraded permission handling |
| Alerts list/detail | GET | `/items/alerts[/:id]` | `OperationsWorkflowsService` | Alerts/Dashboard/Compliance/Reports | ✅ IMPLEMENTED |
| Alert workflow | POST | `/wellar/alerts/:id/workflow` | `OperationsWorkflowsService` | Alerts | ✅ IMPLEMENTED |
| Notifications schema/list | GET | `/fields/notifications`, `/items/notifications` | `NotificationsService` | Topbar/panel | ✅ IMPLEMENTED |
| Mark notification read | PATCH | `/items/notifications/:id` | `NotificationsService` | Topbar/panel | ✅ IMPLEMENTED |
| Activity events | GET | `/items/activity_events` | OperationsSupport/Dashboard | Activity/Dashboard | ✅ IMPLEMENTED |
| Reports data | GET | `/items/departments`, `/items/wellness_scans`, `/items/scan_results`, `/items/alerts`, request collections | `ReportsService` | Reports | ✅ IMPLEMENTED |
| Report export jobs | GET/POST | `/items/reports_exports` | BusinessCenter/OperationsSupport services | No active Reports component consumer | ⚪ DEAD / UNUSED |
| Audit logs | GET/POST | `/items/audit_logs` | `Pages/audit-logs/audit-logs.ts` | Touch-only audit page | PARTIAL — create/detail UX hooks unfinished |
| Account deletion request | POST | `/wellar/account-deletion-requests` | `DeleteAccountComponent` | Public Delete Account | ✅ IMPLEMENTED |
| Admin token proxy | GET | configured `/admin-token` | `AdminTokenService` | Legacy administrative services | PARTIAL — runtime depends on separate proxy and header contract |
| Presence heartbeat | PATCH | `/users/me` | `PresenceHeartbeatService` | App shell | ✅ IMPLEMENTED |
| Organization members legacy | GET | `/items/organization_members` | `OrganizationService` | No active page reference found | ⚪ DEAD / UNUSED |

Notable integration risks:

- Several services contain broad fallback query logic. This improves resilience but can result in partial pages; the current major pages usually surface warnings/errors instead of inventing data.
- Older `BusinessCenterService`, `DashboardService`, and `OperationsSupportService` overlap newer dedicated services. Some endpoints are referenced only by dead/legacy components.
- `requestAllMissing()` has no API call.
- Subscription and upgrade APIs are absent; returned values are hardcoded/synthesized.
- Client-side exports have local error handling but no server persistence/audit job.
- Console logging of notification API result rows remains in production source (`NotificationsService`), which could expose operational notification content in browser developer tools.

## 17. Recommended PRD Changes

### DELETE from PRD

- Delete any claim that Stripe/self-service billing, checkout, billing portal, seat quota enforcement or trial lifecycle is complete.
- Delete the claim that the Angular web app performs camera, voice, reaction-test or AI scan capture.
- Delete “Request All Missing” and Compliance-row “Send Request” from completed functionality.
- Delete a dedicated desktop company-wide Scan History page and dedicated Export Center from the completed list.
- Delete the three-role-only model.

### CHANGE in PRD

- Rename Employee Directory to **Workforce** and document invitation-first onboarding.
- Change Departments from a standalone page to **Organization > Departments**, and change delete to protected deactivation.
- Change Export Center to **Reports with client-side CSV/PDF export**.
- Change Activity Logs to the `activity_events`-based Activity page; identify touch-only `audit_logs` as legacy.
- Change Manager Dashboard to a role-adaptive shared Dashboard scoped to the assigned department.
- Change Employee web experience to a restricted/download-guidance landing; scans occur outside this Angular dashboard.
- Change alert refresh semantics to manual/context/action refresh, not realtime.
- Document that several operational routes use Employee exclusion plus backend scoping rather than positive per-role Angular guards.

### MARK AS COMPLETED

- Organization profile editing and department create/edit/deactivate.
- Operational Dashboard and manager department-scoped dashboard.
- Workforce roster search, scan-state filtering, role/department editing and membership deactivation.
- Scan Request create/queue/status workflow.
- Compliance KPIs, missing/attention list and department breakdown.
- Alert list/detail and persisted review/resolve workflow.
- Reports analytics with local CSV/PDF generation.
- Persistent notification panel and mark-read persistence.
- Authentication, password recovery, workspace context/switching and invitation claim.

### KEEP AS MISSING

- Workforce risk-level filter.
- Compliance individual/bulk request actions and dedicated seven-day chart.
- Personal baseline/calibration progress UI.
- New-alert toast/realtime transport.
- Real subscription tier, seats, quota warnings and billing.
- Direct Owner deletion of employee data; only membership deactivation and a public manual deletion-request flow exist.
- First-scan consent/acknowledgement UI in this web app.

### ADD TO PRD

- HR role, permissions and organization-wide scope.
- Multi-workspace membership, switcher, recovery and active context behavior.
- Workspace creation and account-team-reviewed organization setup applications.
- Full invitation lifecycle and token claim.
- Persistent global notifications with unread/read state.
- Public account-deletion request workflow.
- Account profile/avatar/preferences/session settings.
- Public marketing, policy, pricing and download pages.
- Explicit architecture statement: Angular is the operational review dashboard; mobile/native clients own scan capture and AI processing.

## 18. Evidence Appendix

### Routes, navigation and guards

- `src/app/app.routes.ts`: full active route table; `appAuthGuard`, `businessOnboardingGuard`, `dashboardWorkspaceGuard`, `employeeWebOperationalGuard`, `ownerHrRouteGuard`, mobile matchers and legacy redirects.
- `src/app/ia/wellar-ia.ts`: four-role type, sidebar navigation, route metadata and role/page matrix.
- `src/app/dashboard-shell/sidebar/sidebar.component.ts`: role-filtered navigation, organization switcher, settings and logout actions.
- `src/app/dashboard-shell/topbar/topbar.component.ts`: global notification panel host.

### Core operational pages

- `src/app/Pages/dashboard/dashboard.ts` and `.html`: role-adaptive dashboard and state handling.
- `src/app/services/operational-dashboard.service.ts`: live dashboard aggregation and manager scoping.
- `src/app/Pages/workforce/workforce.ts` and `.html`: roster filters, invitation, role/department mutation, deactivation confirmation and request navigation.
- `src/app/services/workforce-roster-api.service.ts`: protected Workforce endpoint adapter.
- `src/app/services/operations-admin.service.ts`: member, department and invitation administration plus fallback readers.
- `src/app/Pages/requests/requests.ts` and `.html`: request queue/modal/actions and states.
- `src/app/services/operations-workflows.service.ts`: scan-request and alert workflow endpoints; also contains the no-op bulk-missing method.
- `src/app/Pages/compliance/compliance.ts` and `.html`; `src/app/services/compliance.service.ts`: coverage/evidence implementation.
- `src/app/Pages/alerts/alerts.ts` and `.html`: queue, detail and workflow actions.
- `src/app/Pages/reports/reports.ts` and `.html`; `src/app/services/reports.service.ts`; `src/app/services/reports-pdf-export.service.ts`: analytics and client export.
- `src/app/Pages/activity/activity.ts`; `src/app/services/operations-support.service.ts`: activity stream.

### Organization, workspaces and invitations

- `src/app/Pages/company/company.ts` and `.html`; `src/app/services/organization-api.service.ts`: protected organization and department management.
- `src/app/core/context/company-context.service.ts`: active workspace/member/department and switching state.
- `src/app/services/workspace-context-api.service.ts`: context/switch endpoints.
- `src/app/Pages/workspace-access/workspace-access.ts`; `src/app/services/workspace-creation.service.ts`: workspace access/creation.
- `src/app/Pages/workspace-request/workspace-request.ts`; `src/app/services/workspace-applications.service.ts`: reviewed setup applications.
- `src/app/Pages/invites/invites.ts`; `src/app/Pages/invites-claim/invites-claim.ts`; `src/app/services/invites.ts`: invite administration and claim.

### Notifications, privacy, auth and billing evidence

- `src/app/services/notifications.service.ts`; `src/app/shared/ui/global-notifications-panel/*`: persistent notification integration.
- `src/app/public.layout/delete-account/delete-account.ts`: confirmed backend deletion request.
- `src/app/services/auth.ts`; `src/app/services/auth.interceptor.ts`: authentication/session and API-origin bearer policy.
- `src/app/Pages/settings/settings.ts`: active account settings and avatar upload.
- `src/app/services/subscription.service.ts`; `src/app/services/business-upgrade.service.ts`; `src/app/public.layout/upgrade-plan/upgrade-plan.ts`: billing stubs/account-team message.
- `src/app/public.layout/pricing/pricing.ts` and `.html`: static public pricing.

### Dead/legacy evidence

- `src/app/Pages/members/*`, `src/app/Pages/departments/*`, `src/app/Pages/profile/*`, `src/app/Pages/company-setup/*`, `src/app/Pages/my-readiness/*`, `src/app/dashboard-shell/placeholder-page/*`: components absent from active route loading or redirected away.
- `src/app/Pages/mobile/*`: viewport-gated legacy routes; `BusinessCenterMobileComponent` has no route.
- `src/app/Pages/audit-logs/audit-logs.ts`: placeholder create/detail hooks.
- `src/app/services/business-center.service.ts`, `src/app/services/dashboard.service.ts`: overlapping legacy service layer not used by the principal desktop routes.

---

FRONTEND AUDIT COMPLETE  
Implemented: 22  
Partial: 8  
Missing: 10  
Changed: 9  
Extra: 7  
Dead/Unused: 2
