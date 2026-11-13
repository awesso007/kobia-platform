import {describe,it,expect} from "vitest";
import {payrollApprovalRequestEnabled,payrollApprovalRequesterAllowed}
 from "./payroll-approval-request";
describe("posted-run payroll approval requests",()=>{
 it("remain disabled by default and in any fictional demo",()=>{
  expect(payrollApprovalRequestEnabled({})).toBe(false);
  expect(payrollApprovalRequestEnabled({
   CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED:"true",
   CHESS_DEMO_MODE:"true",
  })).toBe(false);
  expect(payrollApprovalRequestEnabled({
   CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED:"true",
   CHESS_DEMO_MODE:"false",
  })).toBe(true);
 });
 it("allows current admins and assigned practitioners, never support or revoked staff",()=>{
  expect(payrollApprovalRequesterAllowed("OWNER","ACTIVE",null,false)).toBe(true);
  expect(payrollApprovalRequesterAllowed("ADMIN","ACTIVE",null,false)).toBe(true);
  expect(payrollApprovalRequesterAllowed("MEMBER","ACTIVE","PRACTITIONER",false)).toBe(true);
  expect(payrollApprovalRequesterAllowed("MEMBER","ACTIVE","MANAGER",false)).toBe(true);
  expect(payrollApprovalRequesterAllowed("MEMBER","ACTIVE","SUPPORT",false)).toBe(false);
  expect(payrollApprovalRequesterAllowed("MEMBER","ACTIVE","PRACTITIONER",true)).toBe(false);
  expect(payrollApprovalRequesterAllowed("ADMIN","SUSPENDED",null,false)).toBe(false);
  expect(payrollApprovalRequesterAllowed("VIEWER","ACTIVE",null,false)).toBe(false);
 });
});
