# CHESS CORP 2 — Round 46 fictional employee/client end-to-end workflow expansion

**Development:** `awesso007/kobia-platform` /
`feature/operations-overview`, draft [PR #24](https://github.com/awesso007/kobia-platform/pull/24).
**Live release:** no merge, no deployment, no real client accounts or external provider execution.

## Interrupted Round 45 recovered and confirmed

The interrupted Round 45 work **was committed**. On its **exact final commit**
`b6b41f590292c4b8335c092f82afe0cb666c1b29`, GitHub Actions
[run 43306304711](https://github.com/awesso007/kobia-platform/actions/runs/43306304711)
completed with **all three normal CI jobs successful**:
`build`, `chess-db-integration`, `chess-legacy-ledger-integration`.
It did **not** run the manually protected signed-in Clerk browser workflow.
The M3 document lifecycle, legal retention, scanned redaction and physical
S3 erasure gates stay default OFF.

## Round 46 — six new real-browser test scenarios (protected only)

New `e2e/chess-demo-round46.spec.mjs` is registered as a third Chromium
suite in `playwright.config.mjs`, alongside the original demo suite and
Round 40 employee/client checks. The **only** browser execution entrypoint
continues to be the manually dispatched
`.github/workflows/chess-demo-browser-e2e.yml`, requiring owner-approved
`chess-demo-e2e` GitHub Environment, the isolated `chess_demo` Neon
database, local-only web server and three **distinct, verified Clerk TEST**
owner/employee/client sessions. This suite does not mint sessions or
impersonate a real user.

| Protected browser scenario | Actual fictional fixture path and expected behavior |
| --- | --- |
| **Owner guided workflow** | Owner opens eight-business tour, chooses Accounting work items, sees `Fictional accounting client follow-up`, then opens finance workspace: no fabricated active financial case |
| **Employee two-browser-tab race** | Signed-in employee opens the same assigned bookkeeping work item in two tabs, saves a nonterminal transition in the first, receives **409** for the stale second tab, reloads and sees the winning state; no COMPLETE/CANCEL |
| **Cross-business forged employee mutation** | Owner retrieves a real *fictional* mortgage task ID and timestamp; separate support employee cannot GET the foreign unit or POST/PATCH its tasks (**403**), and owner observes the original unchanged |
| **Client consent/IDOR attempt** | Verified client visits preview with forged `profileId` hint; only Morgan Fictional and the PENDING disclosure remain. Attempts to POST/DELETE client consent and GET private service document data are denied, with no bearer storage URL |
| **Calendar preference round trip** | Employee explicitly acknowledges work timing, then separately appointment timing, checks states, disables both, reloads and verifies both OFF. Uses only an isolated preference; **no provider worker or external event**. Finally block attempts to restore OFF on failure |
| **Mobile role and accessibility** | Separate 390px employee and client browser contexts retain distinct role UI and no manager or client-consent submission controls; run automated serious/critical WCAG 2.1 A/AA axe checks |

The Round 40 suite remains intact with employee restricted deep links,
stale API optimistic version checks, manager restrictions, three
simultaneous Clerk roles and client private API denial. The older
`chess-demo.spec.mjs` suite also remains in the manual project.

## Ordinary CI — what is truly executed automatically

- `node --check e2e/chess-demo-round46.spec.mjs` validates source syntax.
- `scripts/chess-demo-round46-policy-check.mjs` asserts test discovery,
  preserved protected environment, distinct Clerk sign-in, explicit
  nonterminal 409/403 isolation checks, mobile axe and no unsafe cookies
  or live execution flags.
- The disposable PostgreSQL
  `src/lib/chess/demo-fixtures.integration.test.ts` additionally
  verifies **all five** fictional client relationship scopes (two
  business links each), eight active fictional businesses, no active
  service grants, no private document or regulated case created, and
  exactly one PENDING disclosure per client. It attempts an invalid
  consent GRANTED transition, confirms the database rejects it, and
  re-verifies the tenant fixture remains intact.
- Normal `build`, `chess-db-integration` and
  `chess-legacy-ledger-integration` jobs still run on PR commits.

These are **real tests of source policy and real disposable PostgreSQL
fixtures**, but they are **not evidence that Playwright logged in or
that WCAG checks passed in a browser**. The manual protected workflow
must run, produce traces and an independent reviewer must sign off.
No screenshot or acceptance result is invented.

## Existing credential placeholders and owner supply

Only the existing `chess-demo-e2e` protected Environment is needed:
`secrets.DATABASE_URL` (non-pooled, TLS `chess_demo` Neon only),
`secrets.CLERK_PUBLISHABLE_KEY` (`pk_test_`),
`secrets.CLERK_SECRET_KEY` (`sk_test_`), and GitHub
`vars.CHESS_DEMO_OWNER_EMAIL`,
`vars.CHESS_DEMO_EMPLOYEE_EMAIL`, `vars.CHESS_DEMO_CLIENT_EMAIL`
(three distinct verified test users in one Clerk TEST app).
`CHESS_DEMO_E2E_BASE_URL` remains pinned to local
`http://127.0.0.1:3000`.
The separate test identities must have no production financial/regulated
access. A manual GitHub workflow_dispatch boolean explicitly asserts the
isolated demo target before provisioning.

These fields are registered in the canonical
[owner-supply checklist](CHESS_CORP_2_OWNER_SUPPLY_CHECKLIST.md) groups
**01/02/17/18** and in the names-only
[environment placeholders](CHESS_CORP_2_ENV_PLACEHOLDERS.example).
**No additional external API key, contract, license or feature activation
is necessary to author and run ordinary source CI.** Never commit actual
Neon/Clerk credentials, and never use a live tenant for this fictional
demo. Manual protected E2E is **not run** by ordinary CI.

## Remaining roadmap

Real signed-in two-tenant role downgrade, client identity/consent
revocation, cross-business reassignments, independent auditor/manager
acceptance, device/browser matrix, irreversible financial outcomes,
WORM/retention/PITR and licensed provider execution remain separate
gaps. The Round 46 tests **expand** testable coverage but do not
satisfy the roadmap's all-code-engineering-complete condition.

**Release accounting: 8/8 production milestones blocked,
0/8 independently signed.** Protected browser acceptance pending
independent owner test environment and reviewer. Draft PR #24 remains
unmerged; KOBIA is independent, CHESS is a tenant.

**Final SHA verification:** Normal CI success must be verified on the
exact last Round 46 commit, not any preceding test-only commit.
