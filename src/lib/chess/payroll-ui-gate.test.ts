import {describe,it,expect} from "vitest";
import {payrollExecutionUiEnabled} from "./payroll-ui-gate";
const ready={admin:true,certified:true,providerConfigured:true,demoMode:false};
describe("payroll operator screen gating",()=>{
 it("is off when any approval, role, provider or sandbox flag is missing",()=>{
  expect(payrollExecutionUiEnabled(ready)).toBe(true);
  expect(payrollExecutionUiEnabled({...ready,admin:false})).toBe(false);
  expect(payrollExecutionUiEnabled({...ready,certified:false})).toBe(false);
  expect(payrollExecutionUiEnabled({...ready,providerConfigured:false})).toBe(false);
  expect(payrollExecutionUiEnabled({...ready,demoMode:true})).toBe(false);
 });
});
