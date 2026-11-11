import {describe,it,expect} from "vitest";
import {appointmentReminderKey} from "./appointment-reminders";
describe("appointment reminder idempotency",()=>{
 it("deduplicates repeated scheduler runs for the same booking",()=>{
  const start=new Date("2026-12-03T17:00:00.000Z");
  expect(appointmentReminderKey("appt",start)).toBe(appointmentReminderKey("appt",start));
 });
 it("creates distinct keys for different bookings",()=>{
  const start=new Date("2026-12-03T17:00:00.000Z");
  expect(appointmentReminderKey("first",start)).not.toBe(appointmentReminderKey("second",start));
 });
});
