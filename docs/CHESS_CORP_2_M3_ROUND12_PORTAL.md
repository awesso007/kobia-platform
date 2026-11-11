# CHESS CORP 2 - Round 12: verified client consent portal (development)

**Release state: DISABLED by default; no staging deployment, human signature
provider, regulated legal consent or real client sign-in acceptance verified.**

## Existing green baseline and branch assessment

- Round 11 latest SHA before this work:
  `239ae0d7712929a0d550cd1bbb267ca29212fed3`.
- CI checks at that SHA passed both application and tenant PostgreSQL jobs.
- The draft PR #24 remains unmerged. No previously failing CI needed repair.
- Existing source comments about the absence of consent acceptance or
  self-service withdrawal were stale; corrected in this round.
- Full backlog remains `docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md`.
  Round 12 addresses part of M3-01 only, not the complete document portal.

## New functionality and boundaries

- A dedicated private `/client-consents?tenant=<approved-tenant-slug>`
  dashboard lists consent metadata only when an authenticated Clerk
  account has a verified primary email that matches a currently linked
  contact within the selected tenant. It does not expose profile names
  or client documents and does not use staff CRM membership to grant
  client access. A failed tenant/profile/identity lookup is denied.
- `/client-consents/<opaque-consent-id>?tenant=<tenant>` shows the
  exact immutable policy snapshot only to that verified client.
  PENDING records may be explicitly accepted; only accepted records
  tied to the original Clerk user may be withdrawn. Already withdrawn
  or expired records display read-only state.
- The existing CHESS consent acceptance and withdrawal API remains
  the only mutation path; it requires same-origin JSON, verified
  identity for acceptance, immutable proof and append-only security
  events. The new portal does not create independent approval state.
- Tenant middleware reserves `/client-consents`, resolves the same
  selected tenant for the client page and consent API, and avoids
  rewriting the new page onto a legacy tenant route. All client portal
  responses are private/no-store, deny iframe embedding and disallow
  search indexing. Anonymous HTTP smoke and unit regressions added.
- Older `/app/client-consent/<id>` links redirect to the separate
  client portal only after the portal has been independently enabled.
- An approved consent is **not** a qualified e-signature. The app does
  not authorize outside sharing or reverse previous authorized
  disclosures when a client withdraws consent. No real client
  documents are surfaced through the new dashboard.

## Exact new configuration placeholders

All three **server-side** variables must equal `true` to expose the
new client dashboard; defaults are disabled:

| Variable | Purpose | Initial value |
|---|---|---|
| `CHESS_CLIENT_CONSENT_PORTAL_ENABLED` | Explicit separate portal release | `false` |
| `CHESS_CLIENT_PORTAL_POLICY_APPROVED` | Authorized review of displayed policy and withdrawal copy, retention and legal scope | `false` |
| `CHESS_CLIENT_PORTAL_IDENTITY_APPROVED` | Approved Clerk verified-email/customer-contact matching policy and tenant selection | `false` |

Existing prerequisites: `CHESS_CONSENT_EVIDENCE_KEY` (vault secret,
32+ characters), deployed Clerk public/secret keys,
`CHESS_PUBLIC_ORIGIN` (canonical HTTPS origin), correctly segregated
tenant PostgreSQL schema, reviewed immutable consent migration, legal
client contact mapping and approved storage/scanner policies for any
future documents. No new vendor API key was generated or configured.

The manual `chess-staging` workflow reads the three optional protected
variables and fails deployment preflight if the portal is enabled
without both independent approvals.

## Required protected staging acceptance

1. Set up a fictional tenant and real Clerk sandbox users, including a
   verified matching client email, a different verified client, and
   a separate account sharing an email but not the original acceptor's
   Clerk identity. Do not put passwords or cookies in Git.
2. Create synthetic pending, granted, withdrawn and expired
   disclosures, with linked fictional CRM contact and profile.
3. Validate the new private client URL, policy version and exact
   text display, accept checkbox, withdrawal confirmation,
   noncacheable response and absence of external document exposure.
4. Verify anonymous, wrong-email, wrong-tenant, stale/expired,
   duplicate-acceptance and another-account-with-the-same-email
   rejection; confirm audit events and immediately effective
   downstream consent revocation.
5. Run full keyboard/screen reader, browser and accessibility checks,
   legal policy review, session cookie expiry and DPA/retention audit.
6. Independently verify provider-backed legal e-signature requirements,
   contact onboarding and tenant data mapping before any real client
   session is permitted.

**Production hold remains.** Code CI alone cannot verify these
signed-in scenarios, legal qualifications or provider integrations.
