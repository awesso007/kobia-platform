import {describe,expect,it} from "vitest";
import {clientConsentPortalActive} from "./client-consent-portal-policy";
describe("M3 approved client consent portal release gate",()=>{
 it("stays off with missing or partial approval",()=>{
  expect(clientConsentPortalActive({})).toBe(false);
  expect(clientConsentPortalActive({enabled:"true"})).toBe(false);
  expect(clientConsentPortalActive({
   enabled:"true",policyApproved:"true"})).toBe(false);
  expect(clientConsentPortalActive({
   enabled:"true",identityApproved:"true"})).toBe(false);
  expect(clientConsentPortalActive({
   enabled:"TRUE",policyApproved:"true",identityApproved:"true"})).toBe(false);
 });
 it("requires three explicit independent approvals to render",()=>{
  expect(clientConsentPortalActive({
   enabled:"true",policyApproved:"true",identityApproved:"true"})).toBe(true);
 });
});
