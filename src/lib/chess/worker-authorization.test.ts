import {describe,it,expect} from "vitest";
import {isAuthorizedWorkflowTenant} from "./worker-authorization";
describe("machine-only workflow tenant allowlist",()=>{
 const cfg={schedulerEnabled:"true",allowedTenants:"chess,fig",calendarEnabled:"true"};
 it("rejects disabled or out-of-allowlist tenants",()=>{
  expect(isAuthorizedWorkflowTenant("chess",{...cfg,schedulerEnabled:"false"})).toBe(false);
  expect(isAuthorizedWorkflowTenant("outsider",cfg)).toBe(false);
  expect(isAuthorizedWorkflowTenant("chess",{...cfg,allowedTenants:""})).toBe(false);
  expect(isAuthorizedWorkflowTenant("chess",{...cfg,allowedTenants:"chess,../evil"})).toBe(false);
 });
 it("only permits explicitly approved tenants and calendar activation",()=>{
  expect(isAuthorizedWorkflowTenant("chess",cfg)).toBe(true);
  expect(isAuthorizedWorkflowTenant("fig",cfg,true)).toBe(true);
  expect(isAuthorizedWorkflowTenant("fig",{...cfg,calendarEnabled:"false"},true)).toBe(false);
 });
});
