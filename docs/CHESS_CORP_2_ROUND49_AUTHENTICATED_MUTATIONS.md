# CHESS CORP 2 — Round 49 historical authenticated mutation review

**Branch:** `feature/operations-overview` (draft PR #24).
**Repository:** `awesso007/kobia-platform`.
**State:** code-only; not merged, deployed, consented or independently certified.

## Source-of-truth and review method

The Round 37 inventory declares **111**
`READ_PATH_REVIEW_REQUIRED` files, some GET-only, some multi-method.
The prior Round 48 source gate classified 162 historical route
files total. In Round 49, the code enumerates actual non-GET
method exports from each one, distinguishes direct RBAC
(`await requirePermission(...)` *before* `getTenantDb()`)
from owned-mail delegates and explicit public/machine/special
service exceptions. Because a method can be added later, CI
runs the inventory on the current source, not on a frozen
hand-entered path count. The CI gate refuses silently missing
authentication and missing child/parent guards. This is
**method admission coverage only**, not a claim every mutation
is authorization-atomic with its database write.

The first gate run flagged `feed/follows` POST/DELETE because
authorization was in a shared `handle()` helper, not the entrypoint.
Round 49 made `requirePermission("record:create")`
explicit before that handler while retaining helper defense in depth.

## Implemented controls

| Family | Enforced boundary | Test/CI evidence |
| --- | --- | --- |
| Tenant-module selector | Exact safe slug, Clerk user, live ACTIVE registry + schema + membership; same-origin JSON | Pure policy test, method CI marker |
| LOCAL development upload | Authenticated role, same origin, exact tenant key, original uploader ID, LOCAL/UPLOADING, positive exact size, streamed 25 MiB cap, disabled in production | Pure negative/positive uploader/boundary tests |
| Forms and workflows | Form ID required for child field/step GETless mutations, reorders reject duplicates/foreign IDs, step assignment never crosses form; workflow run bound to workflow ID | Prisma-selector mock tests, method source gate |
| Sites | Page GET/PATCH/DELETE siteId required; blocks POST/PATCH/DELETE page/site and block relation required; domain delete requires domain.siteId | Prisma-selector mock tests, source gate |
| Chat | ACTIVE tenant identity and PRIVATE/DM/GROUP_DM channel membership required for message GET/POST, mark-read, react, pin, edit/delete; no implicit private joins or cross-channel thread replies; target DM user ACTIVE | Membership and parent-child selector tests |
| Feed follows | Permission at both POST and DELETE entrypoints | New source gate |

Additional code changes: active module cookie sets `secure` in
production; `/api/files/upload-url` now checks declared upload
size before preparing storage. This does not replace signed S3
object handling.

## Not certified; remaining engineering

The legacy KOBIA app uses coarse, tenant-scoped `record:*`
permissions in numerous routes. A CHESS employee assigned only
to one business must not receive cross-business access merely
because the account has an ACTIVE Membership. A safe
per-business and per-client-service authorization join in the
**same transaction as each individual mutation** remains
unfinished. The existing GET-release audit is not a
transaction-coupled SELECT. Some exception routes (public
esign/kb, authenticated tRPC procedures, webhook families,
mail provider/draft side effects) need separate full method
review. Origin/CSRF enforcement across every historic JSON
mutation, file/provider replay idempotency, central audit
trails and signed-in multi-tenant access races are open.
Some CURRENT code may reject previously permitted UX operations
such as local upload without known content length or DM access
without channel membership; those need validated staging
adaptation, not an insecure bypass.

Tests added here use pure policy and mock Prisma selectors;
they do **not** simulate protected Clerk sessions, real
Neon role/consent races, compliant vendor providers or
production data. The method CI gate detects drift but does
not establish runtime transactional correctness.

## Owner inputs and release

No newly required external credential was embedded in code.
Existing `CHESS_PUBLIC_ORIGIN`, isolated Clerk TEST/Neon
identities and independent M1/M8 reviewers are in the
consolidated owner checklist. No code was merged into
production `main`, and no change to
`kobia-platform.vercel.app` is authorized.

**M1 and M8: PARTIAL — BLOCKED. All 8/8 production milestones
remain blocked, 0/8 independently signed off.** A final
green 3-job CI result must match the exact final commit SHA.
