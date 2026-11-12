import {describe,it,expect} from "vitest";
import {validPostedPayrollTotals,payrollSourceSchema} from "./payroll-source";
import {payrollFingerprint} from "./payroll-provider";
describe("server-authoritative mapped posted payroll approval source",()=>{
 it("accepts plausible posted financial totals and rejects negatives and over-allocations",()=>{
  expect(validPostedPayrollTotals({totalGrossCents:50000n,
   totalNetCents:40000n,totalTaxesCents:10000n})).toBe(true);
  expect(validPostedPayrollTotals({totalGrossCents:0n,
   totalNetCents:0n,totalTaxesCents:0n})).toBe(false);
  expect(validPostedPayrollTotals({totalGrossCents:100n,
   totalNetCents:90n,totalTaxesCents:20n})).toBe(false);
  expect(validPostedPayrollTotals({totalGrossCents:100n,
   totalNetCents:-1n,totalTaxesCents:30n})).toBe(false);
 });
 it("refuses client-supplied payroll totals, digest, entity or tenant mapping",()=>{
  const base={businessId:"unit",clientProfileId:"client",
   legacyPayRunId:"posted-run",serviceCaseId:"case"};
  expect(payrollSourceSchema.parse(base)).toEqual(base);
  for(const extra of [{grossCents:"999"},{digest:"abc"},
   {tenantId:"other"},{entityId:"other"},{status:"DRAFT"}]){
   expect(()=>payrollSourceSchema.parse({...base,...extra})).toThrow();
  }
 });
 it("binds the approval hash to immutable run amount, entity and date inputs",()=>{
  const base={tenantId:"tenant",entityId:"entity",payRunId:"run",
   grossCents:"50000",netCents:"40000",taxCents:"10000",
   payDate:"2026-10-31T00:00:00.000Z"};
  const digest=payrollFingerprint(base);
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(payrollFingerprint({...base,grossCents:"50001"})).not.toBe(digest);
  expect(payrollFingerprint({...base,entityId:"other"})).not.toBe(digest);
  expect(payrollFingerprint({...base,payDate:"2026-11-01T00:00:00.000Z"})).not.toBe(digest);
 });
});
