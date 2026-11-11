import {describe,expect,it} from "vitest";
import {selfConsentState,verifiedConsentContactMatch}
 from "./client-consent-self-service";

describe("M3 client consent portal privacy policy",()=>{
 const now=new Date("2026-11-11T12:00:00.000Z");
 it("does not reveal accepted records belonging to another Clerk identity",()=>{
  expect(selfConsentState({status:"GRANTED",
   acceptedByClerkUserId:"somebody-else",expiresAt:null},"viewer",now))
   .toBeNull();
  expect(selfConsentState({status:"WITHDRAWN",
   acceptedByClerkUserId:"somebody-else",expiresAt:null},"viewer",now))
   .toBeNull();
 });
 it("allows signed-in clients to review pending and their own accepted status",()=>{
  expect(selfConsentState({status:"PENDING",
   acceptedByClerkUserId:null,expiresAt:null},"viewer",now)).toBe("PENDING");
  expect(selfConsentState({status:"GRANTED",
   acceptedByClerkUserId:"viewer",expiresAt:null},"viewer",now)).toBe("GRANTED");
  expect(selfConsentState({status:"WITHDRAWN",
   acceptedByClerkUserId:"viewer",expiresAt:null},"viewer",now)).toBe("WITHDRAWN");
 });
 it("shows overdue requests as expired, never as a new acceptance opportunity",()=>{
  expect(selfConsentState({status:"PENDING",
   acceptedByClerkUserId:null,expiresAt:new Date("2026-01-01")}, "viewer",now))
   .toBe("EXPIRED");
  expect(selfConsentState({status:"GRANTED",
   acceptedByClerkUserId:"viewer",expiresAt:new Date("2026-01-01")},"viewer",now))
   .toBe("EXPIRED");
  expect(selfConsentState({status:"REJECTED",
   acceptedByClerkUserId:"viewer",expiresAt:null},"viewer",now)).toBeNull();
 });
 it("never matches a different verified customer email",()=>{
  expect(verifiedConsentContactMatch("CLIENT@example.com","client@example.com")).toBe(true);
  expect(verifiedConsentContactMatch(" client@example.com ","CLIENT@example.com ")).toBe(true);
  expect(verifiedConsentContactMatch("other@example.com","client@example.com")).toBe(false);
  expect(verifiedConsentContactMatch("client@example.com",null)).toBe(false);
 });
});
