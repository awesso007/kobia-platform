import {afterEach,describe,expect,it,vi} from "vitest";
import {payrollProviderConfigured,payrollFingerprint} from "./payroll-provider";
afterEach(()=>vi.unstubAllEnvs());
describe("payroll dispatch configuration",()=>{
 it("fails closed without provider credentials or execute flag",()=>{
  vi.stubEnv("CHESS_PAYROLL_EXECUTION_ENABLED","false");
  expect(payrollProviderConfigured()).toBe(false);
 });
 it("rejects an unapproved host and HTTP",()=>{
  vi.stubEnv("CHESS_PAYROLL_EXECUTION_ENABLED","true");
  vi.stubEnv("CHESS_PAYROLL_API_KEY","test-key");
  vi.stubEnv("CHESS_PAYROLL_ALLOWED_HOST","payroll.example.com");
  vi.stubEnv("CHESS_PAYROLL_API_URL","http://payroll.example.com/execute");
  expect(payrollProviderConfigured()).toBe(false);
  vi.stubEnv("CHESS_PAYROLL_API_URL","https://evil.example.com/execute");
  expect(payrollProviderConfigured()).toBe(false);
  vi.stubEnv("CHESS_PAYROLL_API_URL","https://payroll.example.com/execute");
  expect(payrollProviderConfigured()).toBe(true);
 });
 it("generates stable, amount-sensitive fingerprints",()=>{
  const p={tenantId:"one",entityId:"entity",payRunId:"run",grossCents:"10000",netCents:"8000",taxCents:"2000",payDate:"2026-11-10"};
  expect(payrollFingerprint(p)).toBe(payrollFingerprint(p));
  expect(payrollFingerprint(p)).not.toBe(payrollFingerprint({...p,netCents:"9000"}));
 });
});
