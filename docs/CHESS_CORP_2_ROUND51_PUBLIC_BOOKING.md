# CHESS CORP 2 — Round 51 public booking consistency and tenant boundary

**Branch:** feature/operations-overview, draft PR #24. **Production:** main/Vercel unchanged.

Round 50 left public capability paths for separate review. This round addresses
the three public booking endpoints only; this is not a public-route certification.

- GET slots, POST submit and POST cancel now validate an ACTIVE platform
  tenant registry row with an exact schema name. Suspended, foreign-schema
  and unknown tenant selectors cannot open a tenant client.
- Slot date parsing refuses invalid overflow dates.
- New SERIALIZABLE tenant DB transaction revalidates the ACTIVE booking page
  and selected slot, chooses only the page owner's personal calendar (or an
  explicitly TEAM calendar for ownerless pages), and commits the contact,
  calendar event, attendee and booking together. Concurrent attempts for the
  same page/time cannot both commit; PostgreSQL P2034 returns 409.
- Contact search indexing, notifications, email and automation are post-COMMIT
  best-effort work, never run after a failed reservation.
- Invalid public form value types and oversized custom answer fields fail
  closed. Errors never include internal database details.
- Regression code includes pure public-scope/status checks, a source drift
  gate and disposable PostgreSQL simultaneous booking and owner calendar tests.

**Still incomplete:** distributed rate limiting, exact web-origin allowlisting
where appropriate, timezone/DST UX, outbox/idempotency for external booking
notifications, consent and retention review for public PII, other public
capability/machine routes, real two-tenant protected Clerk/Neon staging, load/
security review and independent legal/regulatory acceptance.

Use owner checklist existing items 02, 04, 06, 17 and 18 for a witnessed
protected fictional booking abuse/concurrency test. No new provider key is
needed for the code-only scope. No production release is authorized.
**8/8 milestone production gates blocked, 0/8 independently signed off.**
