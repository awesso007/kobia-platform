import {describe,expect,it} from "vitest";
import {canReviewRegulatedWorkflow,requiredRegulatedChecklist,
 workflowService,regulatedIdempotencyKey,validAffiliation} from "./regulated-policy";
describe("M6 regulated intake policies",()=>{
 it("binds all eight workflow kinds to exactly one regulated service",()=>{
  const cases={
   MORTGAGE:["MORTGAGE_APPLICATION_COORDINATION","MORTGAGE_DOCUMENT_INTAKE"],
   INSURANCE:["INSURANCE_COVERAGE_INTAKE","INSURANCE_APPLICATION_COORDINATION"],
   REAL_ESTATE:["REAL_ESTATE_BUYER_INTAKE","REAL_ESTATE_SELLER_INTAKE"],
   INVESTMENTS:["INVESTMENTS_GOAL_DISCOVERY","INVESTMENTS_RISK_DISCOVERY"],
  };
  for(const [service,kinds] of Object.entries(cases))for(const kind of kinds){
   expect(workflowService(kind)).toBe(service);
   expect(requiredRegulatedChecklist(kind).length).toBeGreaterThanOrEqual(6);
  }
  expect(workflowService("UNAUTHORIZED_TRADE")).toBeNull();
  expect(()=>requiredRegulatedChecklist("INSURANCE_BIND_POLICY")).toThrow();
 });
 it("requires three distinct human actors to prepare, review and approve",()=>{
  const draft={status:"DRAFT",createdByClerkUserId:"staff",
   reviewedByClerkUserId:null};
  expect(canReviewRegulatedWorkflow(draft,"staff","ADMIN","REVIEW")).toBe(false);
  expect(canReviewRegulatedWorkflow(draft,"reviewer","MEMBER","REVIEW")).toBe(false);
  expect(canReviewRegulatedWorkflow(draft,"reviewer","ADMIN","REVIEW")).toBe(true);
  const review={...draft,status:"REVIEW",reviewedByClerkUserId:"reviewer"};
  expect(canReviewRegulatedWorkflow(review,"reviewer","OWNER","APPROVED")).toBe(false);
  expect(canReviewRegulatedWorkflow(review,"staff","OWNER","APPROVED")).toBe(false);
  expect(canReviewRegulatedWorkflow(review,"approver","OWNER","APPROVED")).toBe(true);
 });
 it("uses stable, tenant-and-business-bound idempotency keys",()=>{
  const digest=regulatedIdempotencyKey("tenant-a","business-a","case","ticket-key");
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(digest).toBe(regulatedIdempotencyKey("tenant-a","business-a","case","ticket-key"));
  expect(digest).not.toBe(regulatedIdempotencyKey("tenant-b","business-a","case","ticket-key"));
  expect(digest).not.toBe(regulatedIdempotencyKey("tenant-a","business-b","case","ticket-key"));
 });
 it("refuses affiliations without independent fresh registry verification",()=>{
  const now=new Date("2026-11-10T20:00:00.000Z");
  const valid={status:"VERIFIED",checkedAt:new Date("2026-11-10T19:00:00Z"),
   expiresAt:new Date("2099-01-01T00:00:00Z"),verifiedByClerkUserId:"reviewer",
   sourceUrl:"https://official.example.gov/firm"};
  expect(validAffiliation(valid,now)).toBe(true);
  expect(validAffiliation({...valid,status:"UNVERIFIED"},now)).toBe(false);
  expect(validAffiliation({...valid,checkedAt:new Date("2026-11-08T19:00:00Z")},now)).toBe(false);
  expect(validAffiliation({...valid,verifiedByClerkUserId:null},now)).toBe(false);
 });
});
