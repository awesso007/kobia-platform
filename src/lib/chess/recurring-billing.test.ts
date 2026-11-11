import {describe,expect,it} from "vitest";
import {nextUtcBillingMonth,subscriptionInvoiceKey,
 recurringInvoiceDraftsEnabled} from "./recurring-billing";

describe("M7 recurring invoice draft safety",()=>{
 it("moves to first of next UTC calendar month",()=>{
  expect(nextUtcBillingMonth(new Date("2026-11-30T23:59:59Z")).toISOString())
   .toBe("2026-12-01T00:00:00.000Z");
  expect(nextUtcBillingMonth(new Date("2026-12-31T23:59:59Z")).toISOString())
   .toBe("2027-01-01T00:00:00.000Z");
 });
 it("derives a replay-stable key scoped to subscription and month",()=>{
  const x=subscriptionInvoiceKey("fictional_plan_123",new Date("2026-12-01T00:00:00Z"));
  expect(x).toBe("sub_fictional_plan_123_202612");
  expect(x).not.toBe(subscriptionInvoiceKey("fictional_plan_123",
   new Date("2027-01-01T00:00:00Z")));
 });
 it("never runs the scheduler without explicit policy and worker activation",()=>{
  expect(recurringInvoiceDraftsEnabled()).toBe(false);
 });
});
