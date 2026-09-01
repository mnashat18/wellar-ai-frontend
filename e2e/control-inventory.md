# Active control inventory

This inventory records the primary safe controls covered by the smoke suite. Endpoint mappings are intentionally omitted where a control is navigation-only or service-dependent.

| Route | Control label | Selector | Handler/service | Endpoint | Safe E2E covered? | Mutation? | Permission |
|---|---|---|---|---|---|---|---|
| `/app/dashboard` | Refresh | `button` matching `/refresh/i` | `Dashboard.refresh()` | Dashboard read chain | Yes | No | Authenticated workspace |
| `/app/dashboard` | Scan Requests | `a[href="/app/scan-requests"]` | RouterLink | — | Yes | No | Workspace |
| `/app/dashboard` | Review Alerts | `a[href="/app/alerts"]` | RouterLink | — | Yes | No | Workspace |
| `/app/workforce` | Refresh | `button` matching `/refresh/i` | Workforce refresh | Workforce read APIs | Planned | No | Workspace |
| `/app/compliance` | Refresh / Apply / Clear | `.dashboard-action-button` | Compliance page handlers | Compliance read APIs | Planned | No | Workspace |
| `/app/reports` | Export | export action | Reports export service | Report read/export APIs | Planned | No | Workspace |
| `/app/settings` | Tabs | tab buttons | Settings page handlers | Settings read APIs | Planned | No | Owner/HR where applicable |
| All authenticated routes | Sidebar navigation | `.app-sidebar__nav-item` | RouterLink | — | Yes | No | Route guard |
| All authenticated routes | Account menu | `.app-sidebar__account-control` | Sidebar account handlers | Profile/logout APIs | Planned | Logout only | Authenticated |
