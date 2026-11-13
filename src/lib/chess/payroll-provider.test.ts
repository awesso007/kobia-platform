import {afterEach,describe,expect,it,vi} from "vitest";
import {payrollProviderConfigured,payrollFingerprint,payrollStatusConfigured,getPayrollProviderStatus} from "./payroll-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
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

describe("M5 payroll status vendor sandbox contract (mocked)",()=>{
 function configure(){
  vi.stubEnv("CHESS_PAYROLL_PROVIDER_CERTIFIED","true");
  vi.stubEnv("CHESS_PAYROLL_STATUS_ENABLED","true");
  vi.stubEnv("CHESS_PAYROLL_STATUS_API_URL","https://payroll.example.test/status");
  vi.stubEnv("CHESS_PAYROLL_ALLOWED_HOST","payroll.example.test");
  vi.stubEnv("CHESS_PAYROLL_API_KEY","sandbox-token");
 }
 const lookup={tenantId:"tenant",entityId:"entity",payRunId:"run-42",
  idempotencyKey:"digest",providerRequestId:"provider-42"};
 it("fails closed unless status lookup is enabled with an exact HTTPS host",()=>{
  configure();
  expect(payrollStatusConfigured()).toBe(true);
  vi.stubEnv("CHESS_PAYROLL_STATUS_ENABLED","false");
  expect(payrollStatusConfigured()).toBe(false);
  vi.stubEnv("CHESS_PAYROLL_STATUS_ENABLED","true");
  vi.stubEnv("CHESS_PAYROLL_STATUS_API_URL","http://payroll.example.test/status");
  expect(payrollStatusConfigured()).toBe(false);
 });
 it("accepts confirmed same-run assertions without submitting payroll",async()=>{
  configure();
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   payRunId:"run-42",providerRequestId:"provider-42",status:"paid",
   observedAt:new Date().toISOString(),
  })});
  vi.stubGlobal("fetch",mock);
  const outcome=await getPayrollProviderStatus(lookup);
  expect(outcome.status).toBe("paid");
  const [url,options]=mock.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://payroll.example.test/status");
  expect(options.redirect).toBe("error");
  expect(JSON.parse(String(options.body))).toEqual(lookup);
 });
 it("rejects a provider response for a different payroll run",async()=>{
  configure();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   payRunId:"other-tenant-pay-run",providerRequestId:"provider-42",
   status:"paid",observedAt:new Date().toISOString(),
  })}));
  await expect(getPayrollProviderStatus(lookup)).rejects.toThrow();
 });
});
