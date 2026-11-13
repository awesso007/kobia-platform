/**
 * Round 53 executable CI drift guard for anonymous booking and analytics.
 */
import { readFileSync } from "node:fs";
const read = p => readFileSync(p, "utf8");
const problems = [];
const paths = [
  "src/app/api/book/[slug]/submit/route.ts",
  "src/app/api/book/[slug]/cancel/route.ts",
  "src/app/api/book/[slug]/slots/route.ts",
  "src/app/api/f2/[slug]/track/route.ts",
  "src/app/api/sites/track/route.ts",
];
for (const path of paths) {
  const source = read(path);
  for (const marker of ["admitPublicSurface(", "publicFormErrorResponse("])
    if (!source.includes(marker)) problems.push(path + " missing " + marker);
  if (/new Map<|x-forwarded-for|rateLimited\(/.test(source))
    problems.push(path + " reintroduced process-local or forged-IP quotas");
}
for (const p of [
  "src/app/api/book/[slug]/submit/route.ts",
  "src/app/api/book/[slug]/cancel/route.ts",
  "src/app/api/f2/[slug]/track/route.ts",
  "src/app/api/sites/track/route.ts",
]) if (!read(p).includes("readPublicFormBody(req"))
  problems.push(p + " lacks bounded request-body read");
const cancel = read("src/lib/calendar/public-booking-cancel-round53.ts");
for (const marker of ["db.$transaction(async tx", "secureBookingManageTokenMatches",
  "tx.booking.updateMany", "tx.calendarEvent.updateMany"])
  if (!cancel.includes(marker)) problems.push("Cancellation not atomic: " + marker);
const booking = read(paths[0]);
if (!booking.includes('kind: "booking_submit"') ||
    !booking.includes("token: body.turnstileToken"))
  problems.push("Booking submit must verify a unique bot token");
const ui = read("src/app/book/[slug]/BookingClient.tsx");
for (const x of ["<PublicFormChallenge", "challengeToken", "setResetNonce"])
  if (!ui.includes(x)) problems.push("Booking UI missing " + x);
const page = read("src/app/book/[slug]/page.tsx");
for (const x of ["activePublicTenantSchema(", "publicSurfaceAction(", "NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY"])
  if (!page.includes(x)) problems.push("Booking page missing " + x);
const site = read("src/app/api/sites/track/route.ts");
for (const x of ['published: true', 'siteId, published: true', "db.sitePage.findFirst"])
  if (!site.includes(x)) problems.push("Site analytics missing published parent guard " + x);
if (/\bimport\s+.*\bdispatchAutomation\b|await\s+dispatchAutomation\s*\(/.test(site))
  problems.push("Anonymous analytics cannot dispatch authoritative business actions");
const f2 = read("src/app/api/f2/[slug]/track/route.ts");
for (const x of ['status !== "PUBLISHED"', "formStep.findFirst", "SUBMIT_ATTEMPT"])
  if (!f2.includes(x)) problems.push("F2 analytics missing publication/step/event guard " + x);
if (/"(?:SUBMIT_SUCCESS|PAYMENT_SUCCESS|PAYMENT_INIT)"/.test(f2))
  problems.push("Anonymous F2 analytics can claim authoritative payment/submit success");
const f2page = read("src/app/f2/[slug]/page.tsx");
if (f2page.includes("db.formV2Analytics") || !read("src/app/f2/[slug]/PublicFormUI.tsx").includes('track(formSlug, tenantSlug, "VIEW")'))
  problems.push("F2 hosted page still writes unmetered VIEW on SSR");
const managePage = read("src/app/book/[slug]/reschedule/[bookingId]/[token]/page.tsx");
for (const marker of ["activePublicTenantSchema(", "secureBookingManageTokenMatches(", "publicSurfaceAction("])
  if (!managePage.includes(marker)) problems.push("Public manage page missing " + marker);
const rescheduler = read("src/app/book/[slug]/reschedule/[bookingId]/[token]/RescheduleClient.tsx");
for (const marker of ["<PublicFormChallenge", "turnstileToken: challengeToken",
  "replacementBookingId", "unknownOutcome", "completeOldCancellation"])
  if (!rescheduler.includes(marker)) problems.push("Reschedule client missing " + marker);
if (rescheduler.includes("await fetch(") && rescheduler.includes('setResult("rescheduled")') &&
    !rescheduler.includes("if (!res.ok || !j.ok) throw"))
  problems.push("Reschedule must not claim completion after failed cancellation");
const shared = read("src/lib/security/public-surface-round53.ts");
for (const x of ["claimPublicSurfaceQuota", "activePublicTenantSchema(input.tenant)", "verifyPublicFormChallenge({", "tx.$queryRaw<", "publicFormConfig()", "CHESS_PUBLIC_SURFACE_R53"])
  if (!shared.includes(x)) problems.push("Shared guard missing " + x);
console.log(JSON.stringify({ routes: paths.length, distributed: true,
  bookingChallenge: "server-verified Turnstile", analyticsAuthority: "telemetry only",
  problems }, null, 2));
if (problems.length) throw Error("Round 53 public surface security drift");
