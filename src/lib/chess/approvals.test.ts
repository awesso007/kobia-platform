import {describe,it,expect} from "vitest";
import {canReviewAction,protectedChessApprovalType} from "./approvals";
describe("AI / financial action approval",()=>{
 it("prevents self approval",()=>expect(canReviewAction("a","a","OWNER")).toBe(false));
 it("denies staff reviewer",()=>expect(canReviewAction("a","b","MEMBER")).toBe(false));
 it("accepts distinct admin reviewer",()=>expect(canReviewAction("a","b","ADMIN")).toBe(true));
});

describe("Protected actions cannot use browser-generated approval digests",()=>{
 it("routes payroll and other financial/regulated operations to source-bound endpoints",()=>{
  for(const type of ["PAYROLL_EXECUTE","BANK_POST","TAX_FILE","INSURANCE_BIND","BILLING_SETTLE"]){
   expect(protectedChessApprovalType(type)).toBe(true);
  }
  for(const type of ["INTERNAL_PROCESS_REVIEW","WORKFLOW_EXCEPTION_REVIEW","ACCESS_POLICY_REVIEW"]){
   expect(protectedChessApprovalType(type)).toBe(false);
  }
 });
});
