import {describe,expect,it} from "vitest";
import {serviceReadAuditEvent} from "./service-access-audit";

describe("client-service read audit event boundaries",()=>{
 it("records only server-controlled opaque context for an allowed read",()=>{
  const row=serviceReadAuditEvent({
   businessId:"unit-1",actorClerkUserId:"staff-1",
   linkId:"opaque-link-1",allowed:true,
  });
  expect(row).toEqual({
   businessId:"unit-1",actorClerkUserId:"staff-1",
   action:"CLIENT_SERVICE_LINK_READ",
   resourceType:"ClientServiceLink",resourceId:"opaque-link-1",
   decision:"ALLOW",
  });
  expect(JSON.stringify(row)).not.toContain("email");
 });
 it("does not store a guessed client identifier when a link is missing",()=>{
  const row=serviceReadAuditEvent({
   businessId:"unit-1",actorClerkUserId:"staff-1",
   linkId:null,allowed:false,
  });
  expect(row.decision).toBe("DENY");
  expect(row).not.toHaveProperty("resourceId");
  expect(row).not.toHaveProperty("profileId");
 });
});
