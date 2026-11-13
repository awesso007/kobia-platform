/** Source-drift guard for Round 51 public booking admission and atomicity. */
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");
const routes = ["slots", "submit", "cancel"].map(name =>
  "src/app/api/book/[slug]/" + name + "/route.ts");
const problems = [];
for (const path of routes)
  if (!read(path).includes("activePublicTenantSchema") &&
      !read(path).includes("admitPublicSurface("))
    problems.push(path + " missing ACTIVE tenant/schema registry boundary");
if (routes.some(path => read(path).includes("admitPublicSurface(")) &&
    !read("src/lib/security/public-surface-round53.ts").includes("activePublicTenantSchema(input.tenant)"))
  problems.push("Round 53 admission lost ACTIVE tenant registry verification");
const reserve = read("src/lib/calendar/public-booking.ts");
for (const marker of [
  "db.$transaction(async tx", 'isolationLevel: "Serializable"',
  "getBookingSlots(tx, page", "tx.bookingPage.findUnique",
  "tx.contact.create", "tx.calendarEvent.create",
  "tx.eventAttendee.create", "tx.booking.create",
]) if (!reserve.includes(marker)) problems.push("Missing atomic booking boundary: " + marker);
const route = read("src/app/api/book/[slug]/submit/route.ts");
if (!route.includes("await reservePublicBooking(db,") ||
    /db\.booking\.create|db\.calendarEvent\.create/.test(route))
  problems.push("Public submit still uses non-transactional booking/event writes");
if (!route.includes("if (reserved.newContactId)") ||
    !route.includes("dispatchAutomation({") ||
    route.indexOf("reservePublicBooking(db,") > route.indexOf("dispatchAutomation({"))
  problems.push("Public booking side effects must follow a successful COMMIT");
console.log(JSON.stringify({ scopedPublicBookingRoutes: routes.length,
  atomicBooking: problems.length === 0, problems }, null, 2));
if (problems.length) throw new Error("Round 51 public booking source drift");
