import {describe,expect,it} from "vitest";
import {chessRatePolicies,chessRateSubject,chessRateWindow,
 ChessRateLimitError} from "./api-rate-limit";

describe("M8 isolated, fail-closed request quotas",()=>{
 it("aligns all rate limits to the same UTC minute regardless of clock seconds",()=>{
  expect(chessRateWindow(new Date("2026-11-11T10:48:51.999Z")).toISOString())
   .toBe("2026-11-11T10:48:00.000Z");
  expect(chessRateWindow(new Date("2026-11-11T10:49:00.000Z")).toISOString())
   .toBe("2026-11-11T10:49:00.000Z");
 });
 it("does not store raw user IDs or share counters across tenant identities",()=>{
  const digest=chessRateSubject("user","chess","clerk-user");
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(digest).not.toContain("clerk-user");
  expect(digest).not.toBe(chessRateSubject("user","other","clerk-user"));
  expect(digest).not.toBe(chessRateSubject("tenant","chess","clerk-user"));
 });
 it("limits provider actions more tightly than read-only reporting",()=>{
  expect(chessRatePolicies.billing_delivery.perUser)
   .toBeLessThan(chessRatePolicies.billing_read.perUser);
  expect(chessRatePolicies.ai_suggest.perTenant)
   .toBeLessThan(chessRatePolicies.report_read.perTenant);
  expect(new ChessRateLimitError().status).toBe(429);
 });
});
