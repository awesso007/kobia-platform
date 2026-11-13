import {describe,it,expect} from "vitest";
import {canReviewBoundPayrollApproval} from "./payroll-approval-review";
const digest="f".repeat(64);
const good={actorId:"reviewer",actorRole:"ADMIN",actorStatus:"ACTIVE",
 requestedBy:"requester",status:"PENDING",actionType:"PAYROLL_EXECUTE",
 actualDigest:digest,expectedDigest:digest};
describe("source-bound payroll decision gate",()=>{
 it("permits only independent live admins checking the exact posted run",()=>{
  expect(canReviewBoundPayrollApproval(good)).toBe(true);
  expect(canReviewBoundPayrollApproval({...good,actorId:"requester"})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,actorRole:"MEMBER"})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,actorStatus:"SUSPENDED"})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,status:"APPROVED"})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,actualDigest:"a".repeat(64)})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,actionType:"INTERNAL_PROCESS_REVIEW"})).toBe(false);
  expect(canReviewBoundPayrollApproval({...good,actualDigest:"invalid"})).toBe(false);
 });
});
