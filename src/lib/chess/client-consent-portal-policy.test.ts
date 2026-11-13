import {describe,expect,it} from "vitest";
import {clientConsentPortalActive,clientConsentMutationAllowed} from "./client-consent-portal-policy";
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

describe("server-enforced consent acceptance and withdrawal gates",()=>{
 it("forbids consent acceptance when portal approvals are missing",()=>{
  expect(clientConsentMutationAllowed({},"ACCEPT")).toBe(false);
  expect(clientConsentMutationAllowed({enabled:"true",policyApproved:"true"},"ACCEPT")).toBe(false);
  expect(clientConsentMutationAllowed({enabled:"true",policyApproved:"true",identityApproved:"true"},"ACCEPT")).toBe(true);
 });
 it("forbids ALL client mutation in a fictional demo even when approvals are incorrectly enabled",()=>{
  const config={demoMode:"true",enabled:"true",policyApproved:"true",identityApproved:"true"};
  expect(clientConsentMutationAllowed(config,"ACCEPT")).toBe(false);
  expect(clientConsentMutationAllowed(config,"WITHDRAW")).toBe(false);
 });
 it("preserves withdrawal for a verified existing client even if the portal UI is disabled",()=>{
  expect(clientConsentMutationAllowed({},"WITHDRAW")).toBe(true);
  expect(clientConsentMutationAllowed({demoMode:"true"},"WITHDRAW")).toBe(false);
 });
});
