import {describe,it,expect} from "vitest";
import {mapProviderPayrollStatus} from "./payroll-reconciliation";
describe("M5 provider-reported payroll status classifications",()=>{
 it("never equates submission acceptance with wage payment",()=>{
  expect(mapProviderPayrollStatus("accepted")).toBe("SUBMITTED");
  expect(mapProviderPayrollStatus("pending")).toBe("SUBMITTED");
 });
 it("separately marks vendor assertions and unresolved status",()=>{
  expect(mapProviderPayrollStatus("paid")).toBe("PROVIDER_PAID");
  expect(mapProviderPayrollStatus("failed")).toBe("PROVIDER_FAILED");
  expect(mapProviderPayrollStatus("rejected")).toBe("PROVIDER_FAILED");
  expect(mapProviderPayrollStatus("unknown")).toBe("UNKNOWN");
  expect(mapProviderPayrollStatus("not_found")).toBe("UNKNOWN");
 });
});
