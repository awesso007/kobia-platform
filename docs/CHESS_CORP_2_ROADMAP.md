# CHESS CORP 2 - Unified Client Profile implementation

## Delivered in feature/operations-overview
- Tenant-local ClientProfile, ClientServiceLink, ClientServiceGrant models in prisma/tenant/schema.prisma.
- Fail-closed role and per-service grant policy with unit tests.
- Server operations: create/list/read profile, create/read service link, grant/revoke service access.
- Authenticated HTTP endpoints:
  - GET/POST /api/client-profiles
  - GET /api/client-profiles/:profileId/services?service=MORTGAGE
  - POST /api/client-profiles/:profileId/services
  - PUT/DELETE /api/client-service-links/:linkId/grants

## Privacy boundaries
- A client profile stores basic name and CRM reference only.
- Each service is a separate link with independent user grants.
- Admin role does not bypass individual service read grants.
- Missing tenant, inactive membership, absent grant and revoked grant deny access.
- This **does not** link a client across separate KOBIA tenant databases.
- Avoid storing tax, financial, mortgage, insurance, health, or identity records in shared profile fields.

## Required before production
1. Deploy schema to each tenant through versioned Prisma migrations, with rollback plans.
2. Implement access-change audit events and durable authorization approvals.
3. Add CSRF/origin policy review, anti-enumeration checks, rate limits, and API security tests.
4. Determine legal entities, consent and regulatory purpose limitation before cross-business identity matching.
5. Add a client lookup/merge workflow with duplicate detection and explicit consent.
6. Add UI for employees and clients, field-level access controls, encryption and retention policies.
7. Add PostgreSQL integration tests, complete CI and staging security review.
8. Confirm data residency, retention, breach response and vendor contracts for financial services.

## Remaining CHESS CORP 2 milestones
- M2: Separate CHESS legal-entity/workspace registry and employee assignments.
- M3: Client onboarding, consent, document intake and e-signatures.
- M4: Tasks, appointments, service workflow and manager oversight.
- M5: Bookkeeping, payroll, tax orchestration; retain practice-specific accounting records.
- M6: Mortgage, insurance, real estate and investment workflows with license and affiliation gates.
- M7: Cross-service reporting, billing and human-reviewed AI automations.
- M8: Security hardening, migrations, data import, compliance review, end-to-end tests and production release.

None of M2-M8 is marked complete by this document. The existing KOBIA product is
a shared technical foundation, not evidence that these CHESS modules are deployed.
