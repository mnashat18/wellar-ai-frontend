# Active control inventory

This inventory records primary controls prepared for authenticated browser verification. New entries remain blocked until run with local credentials.

| Route | Control | Selector/role | Handler/service | Endpoint/navigation | Mutation? | Permission | Runtime status | Issue |
|---|---|---|---|---|---|---|---|---|
| `/app/dashboard` | Refresh | button `/refresh/i` | `Dashboard.refresh()` | Dashboard read chain | No | Authenticated workspace | BLOCKED | Credentials unavailable |
| `/app/dashboard` | Scan Requests | link `/scan requests/i` | RouterLink | `/app/scan-requests` | No | Workspace | BLOCKED | Credentials unavailable |
| `/app/dashboard` | Review Alerts | link `/review alerts/i` | RouterLink | `/app/alerts` | No | Workspace | BLOCKED | Credentials unavailable |
| `/app/workforce` | Refresh | button `/refresh/i` | Workforce refresh | Workforce read APIs | No | Workspace | BLOCKED | Credentials unavailable |
| `/app/workforce` | Invite Member open/close | button `/invite member/i` | Workforce invite modal | Invite workflow (not submitted) | No | Owner/HR | BLOCKED | Credentials unavailable |
| `/app/invites` | Invitations page readiness | `app-invites-page app-page-action-bar` text `Invitations` | InvitesPageComponent | `/app/invites` | No | Owner/HR | BLOCKED | Credentials unavailable |
| `/app/compliance` | Refresh / Apply / Clear | buttons `/refresh|apply|clear/i` | Compliance handlers | Compliance read APIs | No | Workspace | BLOCKED | Credentials unavailable |
| `/app/reports` | Export menu | button `/export/i` | Reports export service | CSV/PDF read/export | No | Workspace | BLOCKED | Credentials unavailable |
| `/app/company` | Invite Member open/close | button `/invite member/i` | Company invite modal | Invite workflow (not submitted) | No | Owner/HR | BLOCKED | Credentials unavailable |
| `/app/settings` | Profile/Security tabs | tab buttons `/profile|security/i` | Settings tab handlers | Settings reads | No | Owner/HR where applicable | BLOCKED | Credentials unavailable |
| All authenticated routes | Sidebar navigation | `.app-sidebar__nav-item` | RouterLink | Route navigation | No | Route guard | BLOCKED | Credentials unavailable |
| All authenticated routes | Account menu | `.app-sidebar__account-control` | Sidebar account handlers | Profile/logout APIs | Logout only | Authenticated | BLOCKED | Credentials unavailable |
