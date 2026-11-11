import {afterEach,describe,expect,it,vi} from "vitest";
import {auditArchiveConfigured,auditArchiveEnvelope,
 postAuditArchive,checkAuditArchive} from "./audit-archive-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const event={id:"test-event-id",businessId:"private-unit",
 actorClerkUserId:"private-user",action:"BILLING_INVOICE_APPROVED",
 resourceType:"ChessBillingInvoice",resourceId:"private-invoice",
 decision:"ALLOW",occurredAt:new Date("2026-11-11T06:00:00.000Z")};
function config(){
 vi.stubEnv("CHESS_AUDIT_EXPORT_ENABLED","true");
 vi.stubEnv("CHESS_SCHEDULER_ENABLED","true");
 vi.stubEnv("CHESS_AUDIT_HASH_KEY","isolated-audit-hmac-test-key-over-32-characters");
 vi.stubEnv("CHESS_AUDIT_ARCHIVE_API_KEY","fake-provider-token");
 vi.stubEnv("CHESS_AUDIT_ALLOWED_HOST","archive.test.example");
 vi.stubEnv("CHESS_AUDIT_ARCHIVE_URL","https://archive.test.example/create");
 vi.stubEnv("CHESS_AUDIT_STATUS_URL","https://archive.test.example/status");
}
describe("M8 external audit archive isolation and integrity",()=>{
 it("is disabled until both the tenant scheduler and exact provider host are approved",()=>{
  config();
  expect(auditArchiveConfigured()).toBe(true);
  vi.stubEnv("CHESS_AUDIT_EXPORT_ENABLED","false");
  expect(auditArchiveConfigured()).toBe(false);
  vi.stubEnv("CHESS_AUDIT_EXPORT_ENABLED","true");
  vi.stubEnv("CHESS_AUDIT_STATUS_URL","https://unapproved.invalid/status");
  expect(auditArchiveConfigured()).toBe(false);
 });
 it("pseudonymizes staff, business and resource references while signing evidence",()=>{
  config();
  const a=auditArchiveEnvelope("test-tenant",event);
  expect(a.digest).toMatch(/^[a-f0-9]{64}$/);
  expect(a.actorTag).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(a)).not.toContain("private-user");
  expect(JSON.stringify(a)).not.toContain("private-unit");
  expect(JSON.stringify(a)).not.toContain("private-invoice");
  expect(a.digest).not.toBe(auditArchiveEnvelope("other-tenant",event).digest);
  expect(a.digest).not.toBe(auditArchiveEnvelope("test-tenant",{
   ...event,decision:"REVIEW",
  }).digest);
 });
 it("rejects free-form audit event labels before network transmission",()=>{
  config();
  expect(()=>auditArchiveEnvelope("test-tenant",{
   ...event,action:"User Jane Doe requested financial document",
  })).toThrow();
  expect(()=>auditArchiveEnvelope("test-tenant",{
   ...event,resourceType:"Tax Return, Client Smith",
  })).toThrow();
 });
 it("enforces exact event and digest in both creation and read-only status",async()=>{
  config();
  const envelope=auditArchiveEnvelope("test-tenant",event);
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   eventId:envelope.eventId,digest:envelope.digest,
   status:"archived",receiptId:"immutable-archive-receipt",
  })});
  vi.stubGlobal("fetch",http);
  const acknowledged=await postAuditArchive(envelope);
  expect(acknowledged.receiptId).toBe("immutable-archive-receipt");
  const [url,options]=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://archive.test.example/create");
  expect((options.headers as Record<string,string>)["Idempotency-Key"])
   .toBe(envelope.digest);
  expect(JSON.stringify(options.body)).not.toContain("private-user");
  await checkAuditArchive(envelope);
  expect(http.mock.calls[1]?.[0]).toBe("https://archive.test.example/status");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   eventId:envelope.eventId,digest:"f".repeat(64),
   status:"archived",receiptId:"wrong",
  })}));
  await expect(checkAuditArchive(envelope)).rejects.toThrow();
 });
});
