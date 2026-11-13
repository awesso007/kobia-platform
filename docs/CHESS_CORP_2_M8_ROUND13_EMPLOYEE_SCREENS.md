# Round 13 - CHESS employee-facing UI coverage and acceptance

**Branch:** `feature/operations-overview`, draft PR #24, KOBIA
multi-tenant development only. All pages reuse existing tenant identity,
business assignment, individual service grants and purpose-bound
client-consent backend authorization. Screen display is never
authorization to run regulated or financial transactions.

## Backend coverage audit

| Backend functionality | Employee screen / status |
|---|---|
| Business directory and employee assignment/revocation | `/app/business-units` - owner/admin create workspace, assign roles, revoke unit access |
| Client profile create and directory | `/app/client-profiles` - employee scoped directory; owner/admin create and administer |
| Client service provisioning and per-employee grants/revocation | `/app/client-profiles/[profileId]` - owner/admin service links and read/write/revoke controls |
| Purpose/version-bound client consent request, acceptance and withdrawal | Employee request/status panel on profile; separate default-off verified client consent portal from Round 12 |
| Service case creation and status transition | Owner/admin panel on profile, after current service consent and professional checks; list excludes cases without current grant |
| Generic action approval request and independent decision | `/app/action-approvals` - staff request a digest-only generic operational review; only eligible distinct admin can decide |
| Service document presign, upload confirmation, quarantine and READY download | Embedded in authorized finance and regulated service-case pages; no downloaded object until scanned READY |
| Financial-entity mapping | Authorized case page owner/admin form, restricted to an existing same-tenant ledger entity; never posts financial activity |
| Bank-feed connection register, pause/activate and import | `/app/finance-operations` owner/admin panel; activation and import require approved provider; imported items remain UNMATCHED |
| Individual professional registry verification | `/app/regulated-services` owner/admin official license review panel; self-verification disallowed |
| Appointments, tasks, recurrence, employee calendar consent, alerts, manager queues | Existing `/app/work-items` |
| Bookkeeping bank reviews, tax workpapers, payroll status | Existing finance case pages |
| Regulated checklist, approval, affiliation, opaque handoff and reconciliation | Existing regulated case pages |
| AI task triage, invoice approvals/void, operational reports | Existing dedicated M7 pages |
| Worker health, scheduled jobs, scanner callbacks, webhook reconciliation, audit archive, DR | Server-side machine-only interfaces; deliberately **no** employee run/send control |
| Payroll dispatch, financial transfer, tax filing, mortgage origination, insurance binding, trades | No live execution UI. Existing gateways are disabled/regulated and require independent certification and supervisory release before any employee activation |

### Safety properties

- Owner/admin controls are hidden from staff in the interface. Server
  checks remain independent and authoritative for every mutation.
- Service data is never granted by creating a business unit or client
  service link. Service read/write grants are explicit, revocable and
  required for case-specific metadata/document access.
- The generic approval queue is not a payment/financial execution
  approval. A separate active reviewer must decide; both the request
  and decision write an append-only security event atomically.
- Document uploads use a presigned private-storage URL, confirm the
  exact object in S3 and remain QUARANTINED until malware scanning
  declares READY. List screens omit S3 object keys and signed URLs.
  Short-lived READY downloads always repeat authorization and version
  integrity checks.
- Bank activation requires purpose-specific accepted client consent and
  provider certification. Even a successful bank import only populates
  existing legacy UNMATCHED records, never journal posts.
- Official credential verification may only be attempted by an
  independent authorized administrator. The approved provider must
  return active official evidence; no employee can mark VERIFIED.
- Internal case intake requires active consent; regulated intake
  additionally needs an official verified practitioner. A legal
  client e-signature is a separate, still-pending integration.

## Provider credentials and approvals still required

No new secret is hard-coded. Configured placeholders are inherited
from `docs/CHESS_CORP_2_EXTERNAL_CONFIGURATION.md`:

1. **Authentication/tenant setup:** Clerk sandbox public and secret
   keys, distinct fictional owner/admin, manager, practitioner, staff
   and client sessions; approved tenant schemas, seed profiles and
   business assignments. Independently exercise all newly visible
   client and staff RBAC paths in staging before launch.
2. **Consent:** legally approved policy wording, `CHESS_CONSENT_EVIDENCE_KEY`
   in a managed vault, matching verified client email/contact records,
   legal e-signature provider where required and retention/revocation
   approval. Employee consent requests are PENDING until real client
   acceptance; creating an employee UI does not grant consent.
3. **Documents:** `KOBIA_S3_BUCKET`, `KOBIA_S3_REGION`,
   `KOBIA_S3_ACCESS_KEY_ID`, `KOBIA_S3_SECRET_ACCESS_KEY`
   (optional `KOBIA_S3_ENDPOINT`), private versioned/encrypted S3
   with least-privilege IAM, protected bucket CORS **PUT**
   for the staging application origin and `Content-Type`,
   `CHESS_CLAMAV_HOST`, `CHESS_CLAMAV_PORT`,
   `CHESS_DOCUMENT_SCAN_KEY`, scan worker credentials/allowlist and
   verified CLEAN/INFECTED sandbox tests. Never use development local
   file fallback for CHESS regulated documents.
4. **Official license:** `CHESS_LICENSE_API_URL`,
   `CHESS_LICENSE_ALLOWED_HOST`, `CHESS_LICENSE_API_KEY`,
   `CHESS_LICENSE_SOURCE_HOSTS`, official registry/data license,
   independent reviewer identity, appropriate pre-registered
   practitioner credentials, verified firm affiliations and signed
   compliance authorization. Absent gateway means verification
   controls are disabled.
5. **Bank feed:** `CHESS_BANK_FEED_ENABLED=false`,
   `CHESS_BANK_FEED_IMPORT_ENABLED=false` until approved,
   `CHESS_BANK_FEED_SOURCE=PLAID`, `CHESS_BANK_FEED_API_URL`,
   `CHESS_BANK_FEED_ALLOWED_HOST`, `CHESS_BANK_FEED_API_KEY`,
   verified Plaid sandbox account, internal legacy bank-account
   and ledger entity IDs, opaque provider account reference, and
   separately accepted `bank_feed:<SERVICE>` and
   `service:<SERVICE>` client consents.
6. **Staging and release:** secret manager, `DATABASE_URL` and
   `DIRECT_URL`, `CHESS_PUBLIC_ORIGIN`, approved separate
   staging domain, independent tenant migration/restore validation,
   real three-user/two-tenant authenticated E2E and role-revocation
   audit, keyboard/screen-reader accessibility, S3/CORS/scanner
   acceptance, independent penetration/contract/compliance review
   and signed release-owner approval.

## Still not complete

- Automated CI tests cannot validate real provider IAM/S3 CORS,
  scan worker, actual OAuth, bank sandbox, professional registry
  contract, real signed-in E2E, browser accessibility or legal scope.
- UI coverage does NOT complete M1-M8 production requirements:
  `docs/CHESS_CORP_2_ROUND11_OPEN_ITEMS.md` remains the tracked
  open-requirements register.
- Any future execution screen for bank posting, tax e-file,
  payroll funding, regulated brokerage or trades must be designed
  only after certified vendor and independent financial/compliance
  release gates. This round intentionally keeps machine-only and
  unlicensed actions off the employee menu.
