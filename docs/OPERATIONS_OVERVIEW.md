# KOBIA operations overview - first usable workspace milestone

The first-stage dashboard is at `/app/overview` in the existing KOBIA web app.
`/app` redirects there, and the CRM sidebar includes an Overview link.

## Shipped in this change

- Signed-in, ACTIVE tenant members can open the overview.
- OWNER and ADMIN members see live counts from the currently selected tenant:
  contacts, CRM client companies, leads needing follow-up, open deals, active
  projects, open tasks, and active team memberships.
- Other ACTIVE members see only navigation shortcuts to their own work, with
  no tenant-wide count queries.
- Linked shortcuts reuse existing CRM, task, project, document, calendar and
  team routes. No new database migrations or cross-tenant joins are introduced.
- The selected-tenant database is resolved by the existing middleware and
  `getTenantDb()`. Missing tenants and inactive memberships fail closed.

## Important limitations

- This is an operations *entry point*, not a finished cross-company OS.
- CRM `Company` records represent client/prospect organizations. They are not
  a master registry of Chess Corporation subsidiaries.
- A client's records are not merged across different tenants.
- The overview does not provide accounting, tax, insurance, mortgage,
  investment or other regulated workflows.
- Employee count is an active membership count, not payroll headcount.
- The existing CRM actions have a permissive authorization fallback when
  user membership cannot be resolved. This new overview checks membership
  explicitly; the broader authorization boundary must be hardened before
  storing customer financial or regulated data.

## QA before broad rollout

1. Test logged-out and missing-tenant access.
2. Verify suspended and nonmember accounts cannot see metrics.
3. Verify MEMBER and VIEWER users cannot see tenant-wide summary counts.
4. Create a contact, lead, project and task in a disposable test tenant; verify
   metrics change only in that tenant.
5. Confirm overview shortcuts resolve and remain subject to route-level RBAC.
6. Review middleware tenant resolution and the older CRM default-allow
   permission fallback before any customer financial data.
7. Verify responsive layout, build and CI on the pull request.

KOBIA remains the independent platform. Chess Corporation should be onboarded
as a tenant only after authentication, authorization and data boundaries pass QA.
