import {describe,it,expect} from "vitest";
import {decideCalendarReconciliation} from "./calendar-reconciliation";
describe("calendar gateway reconciliation is conservative",()=>{
 it("resolves confirmed creations only when still consented",()=>{
  expect(decideCalendarReconciliation("UNKNOWN","accepted",true)).toBe("SYNCED");
  expect(decideCalendarReconciliation("UNKNOWN","accepted",false)).toBe("CANCEL_PENDING");
  expect(decideCalendarReconciliation("UNKNOWN","rejected",true)).toBe("REJECTED");
 });
 it("never blindly retries delivery after unconfirmed status",()=>{
  expect(decideCalendarReconciliation("UNKNOWN","pending",true)).toBeNull();
  expect(decideCalendarReconciliation("UNKNOWN","not_found",true)).toBeNull();
  expect(decideCalendarReconciliation("CANCEL_UNKNOWN","pending",false)).toBeNull();
  expect(decideCalendarReconciliation("CANCEL_UNKNOWN","not_found",false)).toBeNull();
 });
 it("confirms cancellation only on provider acceptance",()=>{
  expect(decideCalendarReconciliation("CANCEL_UNKNOWN","accepted",false)).toBe("CANCELLED");
  expect(decideCalendarReconciliation("CANCEL_UNKNOWN","rejected",false)).toBeNull();
 });
});
