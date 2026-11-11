import {describe,expect,it} from "vitest";
import {needsVerifiedLicense,credentialAllowsAssignment,canTransitionServiceCase} from "./regulated-services";
describe("regulated service gates",()=>{
 it("requires verification for regulated businesses",()=>{
  for(const s of ["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"] as const) {
   expect(needsVerifiedLicense(s)).toBe(true);
  }
  expect(needsVerifiedLicense("BOOKKEEPING")).toBe(false);
 });
 it("fails closed for unverified, expired or missing license",()=>{
  expect(credentialAllowsAssignment(null)).toBe(false);
  expect(credentialAllowsAssignment({status:"UNVERIFIED",expiresAt:null})).toBe(false);
  expect(credentialAllowsAssignment({status:"VERIFIED",expiresAt:new Date("2020-01-01")})).toBe(false);
  expect(credentialAllowsAssignment({status:"VERIFIED",expiresAt:null})).toBe(false);
 });
 it("accepts active verified credentials",()=>{
  expect(credentialAllowsAssignment({status:"VERIFIED",expiresAt:new Date("2099-01-01"),verifiedAt:new Date("2026-01-01"),verifiedByClerkUserId:"reviewer",verificationSource:"official-registry",registryCheckedAt:new Date("2026-01-01")})).toBe(true);
 });
});

describe("regulated case lifecycle",()=>{
 it("requires review before active service",()=>{
  expect(canTransitionServiceCase("INTAKE","ACTIVE")).toBe(false);
  expect(canTransitionServiceCase("INTAKE","REVIEW")).toBe(true);
  expect(canTransitionServiceCase("REVIEW","ACTIVE")).toBe(true);
 });
 it("disallows closed-case reopening",()=>{
  expect(canTransitionServiceCase("CLOSED","ACTIVE")).toBe(false);
  expect(canTransitionServiceCase("ACTIVE","HOLD")).toBe(true);
 });
});
