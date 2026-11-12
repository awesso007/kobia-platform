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
 it("rejects forged or legacy-shaped evidence metadata",()=>{
  const base={status:"GRANTED",expiresAt:new Date("2099-01-01"),
   consentedAt:new Date("2026-01-01"),acceptedByClerkUserId:"verified-user",
   verifiedEmailDigest:"a".repeat(64),acceptanceEvidenceDigest:"b".repeat(64)};
  expect(isUsableConsent({...base,verifiedEmailDigest:"digest"})).toBe(false);
  expect(isUsableConsent({...base,acceptanceEvidenceDigest:"not-a-hmac"})).toBe(false);
  expect(isUsableConsent({...base,acceptanceEvidenceDigest:"A".repeat(64)})).toBe(false);
  expect(isUsableConsent({...base,consentedAt:new Date("2100-01-01")})).toBe(false);
  expect(isUsableConsent({...base,withdrawnAt:new Date("2026-01-02")})).toBe(false);
 });
 it("accepts unexpired grants",()=>{
  expect(isUsableConsent({status:"GRANTED",expiresAt:new Date("2099-01-01"),consentedAt:new Date("2026-01-01"),acceptedByClerkUserId:"verified-user",verifiedEmailDigest:"a".repeat(64),acceptanceEvidenceDigest:"b".repeat(64)})).toBe(true);
 });
});
