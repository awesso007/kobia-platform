import {describe,it,expect} from "vitest";
import {isUsableConsent} from "./onboarding";
describe("client consent",()=>{
 it("rejects requests and withdrawn consents as access authority",()=>{
  expect(isUsableConsent({status:"PENDING",expiresAt:null})).toBe(false);
  expect(isUsableConsent({status:"WITHDRAWN",expiresAt:null})).toBe(false);
  expect(isUsableConsent({status:"GRANTED",expiresAt:null})).toBe(false);
 });
 it("rejects expired consent",()=>{
  expect(isUsableConsent({status:"GRANTED",expiresAt:new Date("2024-01-01")})).toBe(false);
 });
 it("accepts unexpired grants",()=>{
  expect(isUsableConsent({status:"GRANTED",expiresAt:new Date("2099-01-01"),consentedAt:new Date("2026-01-01"),acceptedByClerkUserId:"verified-user",verifiedEmailDigest:"digest",acceptanceEvidenceDigest:"evidence"})).toBe(true);
 });
});
