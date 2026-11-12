import {beforeEach,describe,expect,it,vi} from "vitest";
import {withAuditedHistoricalGet} from "./historical-get-response-audit";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {auditedHistoricalTenantRead} from "./historical-sensitive-read";

vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("@/lib/db/get-tenant-db",()=>({
 getTenantDb:vi.fn(()=>({db:{audit:"fictional"}})),
}));
vi.mock("./historical-sensitive-read",()=>({
 auditedHistoricalTenantRead:vi.fn(async(_db:unknown,_context:unknown,
  read:()=>Promise<unknown>)=>read()),
}));
const membership=vi.mocked(getCurrentMembership);
const audit=vi.mocked(auditedHistoricalTenantRead);
const prepared=()=>new Response("sensitive-fictional-data",{status:200});
beforeEach(()=>{
 vi.clearAllMocks();
 membership.mockResolvedValue({clerkUserId:"clerk-test",status:"ACTIVE",
  role:"MEMBER",email:null,displayName:null});
});

describe("Round 43 authenticated historical GET audit-before-release boundary",()=>{
 it("does not execute a read for missing or revoked memberships",async()=>{
  const legacy=vi.fn(async()=>prepared());
  const route=withAuditedHistoricalGet("inventory/stock",legacy);
  membership.mockResolvedValue(null);
  expect((await route()).status).toBe(403);
  membership.mockResolvedValue({clerkUserId:"clerk-test",status:"SUSPENDED",
   role:"MEMBER",email:null,displayName:null});
  expect((await route()).status).toBe(403);
  expect(legacy).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
 });
 it("commits a privacy-minimal event before a success response is released",async()=>{
  const route=withAuditedHistoricalGet("inventory/stock",async()=>prepared());
  const response=await route();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("sensitive-fictional-data");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(audit).toHaveBeenCalledWith({audit:"fictional"},
   expect.objectContaining({actorClerkUserId:"clerk-test",
    action:"HISTORICAL_AUTHENTICATED_GET_RESPONSE",
    resourceType:"HistoricalApiRoute",resourceId:"inventory/stock"}),
   expect.any(Function));
  expect(JSON.stringify(audit.mock.calls)).not.toContain("sensitive-fictional-data");
 });
 it("does not release constructed private data after audit outage",async()=>{
  audit.mockRejectedValueOnce(new Error("audit down"));
  const response=await withAuditedHistoricalGet("chat/unread",
   async()=>prepared())();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("sensitive-fictional-data");
 });
 it("does not mistake an audit-denied successful body for a safe response",async()=>{
  audit.mockRejectedValueOnce(new PermissionError("blocked" as never));
  const response=await withAuditedHistoricalGet("helpdesk/tickets",
   async()=>prepared())();
  expect(response.status).toBe(503);
 });
 it("preserves an explicitly denied response after its denial audit",async()=>{
  audit.mockRejectedValueOnce(new PermissionError("blocked" as never));
  const response=await withAuditedHistoricalGet("inventory/stock",
   async()=>new Response("not-found",{status:404}))();
  expect(response.status).toBe(404);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
 });
 it("rejects unstable route IDs before registering a handler",()=>{
  expect(()=>withAuditedHistoricalGet("../foreign",async()=>prepared())).toThrow();
  expect(()=>withAuditedHistoricalGet("a//b",async()=>prepared())).toThrow();
 });
});
