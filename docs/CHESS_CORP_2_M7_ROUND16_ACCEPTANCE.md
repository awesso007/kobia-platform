# Round 16 - M7 development acceptance and remaining release gates

**Repository:** independent KOBIA SaaS platform; CHESS tenant only.
**Branch:** `feature/operations-overview` and unmerged draft PR #24.
This document inventories built controls; it does NOT certify a
merchant, accountant, AI vendor or production deployment.

## Implemented and testable in code

| Domain | Completed code | Still pending external evidence |
|---|---|---|
| AI triage | Strict provider input/output schemas, response size and maximum-cost bounds, separate signed data-sharing/DPA and cost flags; atomic tenant-local per-business UTC daily call reservation, AI dashboard quota and independent task review | Real contracted gateway supports the cost header, maximum token bound and no-retention contract; true vendor invoices, cost alerts, DPA and controlled sandbox |
| Merchant collection receipts | Signed body HMAC on exact tenant + timestamp, five-minute tolerance, strict USD/amount/merchant/invoice binding, event ID uniqueness and immutable append-only receipt; signed observations are visible to an authorized manager only under current invoice grant | Real signed provider sample and retries, PCI/DPA policies, merchant underwriting, refund/chargeback execution, certified payout/ACH reconciliation and ledger posting |
| Recurring plans | Monthly first-of-month UTC draft schedule, plan writer/independent manager approval, immutable price/scope, tenant worker capped at 20 due plans/run, present consent/permissions/license checks, unique monthly invoice source digest and no auto-send/charge; auto-pause on consent or staff revocation | Real contract acceptance, invoice taxes, monthly billing terms, worker deployment, E2E with 3 separate employees and separate fictional clients, certified settlement/collections |
| Operational period snapshots | Bounded fixed JSON evidence for a completed UTC month, digest bound to tenant/unit/month, one-way PostgreSQL write-once trigger and distinct reviewer; client/server views of original frozen JSON | Actual ledger period-close, intercompany eliminations, business/legal-entity mapping, bank reconciliations, statutory financial reports and independent qualified sign-off |

## Security assurances and limits

- Merchant event HMAC is calculated over
  `tenantSlug.timestamp.rawBody`; a valid signature is necessary,
  but not a receipt for settled money. Event payload rejects
  customer/card/bank account fields and cannot mutate invoice
  payment statuses or post a journal.
- A duplicate provider event ID must match its original signed
  body digest and invoice. Conflicting replays are rejected.
  Event receipt metadata is protected by PostgreSQL
  immutability; a database owner could bypass triggers,
  so runtime DB must not own schemas.
- No employee calendar, banking, mortgage, insurance, tax,
  payroll or investment execution rights can be obtained
  from a generic AI approval or subscription-plan approval.
- AI triage uses only status, due timing category and
  assignment boolean. It does not send task content, personal
  details or client identifiers. The provider must independently
  enforce the advertised output/cost caps; missing cost
  evidence causes denial.
- Monthly billing worker never calls an external payment or
  invoice delivery endpoint. It inserts `ChessBillingInvoice`
  with `DRAFT` status, after current client service/billing
  consent, two distinct active managers, business assignments
  and current individual service write grants.
- Client or administrator withdrawal of service/billing consent
  pauses ACTIVE matching recurring plans atomically and
  emits an audit event. Previously delivered invoices are
  not implicitly cancelled at the vendor, and that must be
  addressed under approved external retention rules.
- Historical operations snapshot contains current workflow
  statuses AT FREEZE TIME for records created during the month.
  It does not prove the workflow held that status during the
  month and cannot be marketed as financial consolidation.

## Human-verified acceptance tests still required

1. Isolated fictional owner/admin/client tenant A and
   tenant B, with cross-business negative tests.
2. AI vendor cost-header, request budget and no-retention
   vendor contract, including malicious extra instructions,
   wrong model response, 429, late response, duplicate
   and consent-revocation races. Verify actual billed
   usage independently against the provider's own meter.
3. Approved merchant test invoice ID and signed
   callback `/api/chess/merchant-events?t=<tenant>`.
   Verify timestamp boundary, different-tenant replay,
   conflicting event IDs, no PCI leakage, never
   `PAID` or `SETTLED` without bank settlement.
4. Recurring plan author, second administrator approval
   and third sender, explicit client service and billing
   consent; atomically pause on withdrawal; replay
   the same UTC month; test suspension of either
   signatory and service grant/assignment removal.
5. Run real provider-only sandbox, separately
   approve worker, verify no double invoice and
   subscription termination/retention.
6. Independently reconcile actual ledger cash, cash
   deposits, taxes, refunds, chargebacks, A/R and
   intercompany eliminations before issuing any
   financial statements.
7. Confirm tenant migration backups and rollback
   rehearsals on all relevant schemas, read-only
   witness, WORM archive receipts, security review,
   accessibility/load tests and signed release owner.

## Provider inventory to supply

- AI: `CHESS_AI_API_KEY`, pinned allowed HTTPS host and
  `CHESS_AI_TRIAGE_API_URL`, DPA, model version, response
  `x-chess-ai-cost-micros` verified usage header,
  per-call price and total daily spend policy.
- Invoice vendor: `CHESS_BILLING_API_KEY`,
  delivery/status URLs, approved contact mapping,
  signed billing disclosures and 3 staff identities.
- Merchant: `CHESS_MERCHANT_PROVIDER_ID`,
  vault-only `CHESS_MERCHANT_WEBHOOK_HMAC_KEY`,
  certified event and bank-payout contracts, legally
  defined fee/tax/refund/chargeback procedures.
- Worker: approved tenant slugs, host-pinned
  `CHESS_PUBLIC_ORIGIN`, a vault-held
  `CHESS_WORKFLOW_WORKER_TOKEN`, protected
  `chess-staging` environment and operator.
- Finance: mapped real legal entities, certified
  provider settlement and banking confirmation,
  no ambiguous posting, professional/independent
  GAAP audit and reporting approval.

**Status:** M7-01/03/06 remain EXTERNAL;
M7-02/04/05 remain BOTH (code and external signoff).
M1-M8 also have unresolved separate roadmap gates.
No completion or live release claim is made by this guide.
