import {beforeEach,describe,expect,it,vi} from "vitest";
import {
 withAuditedHistoricalGet,withAlreadyAuditedHistoricalGet,
} from "./historical-get-response-audit";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {scopedHistoricalTenantClient} from "@/lib/db/historical-read-scope";

vi.mock("@/lib/rbac/require-permission",()=>({getCurrentMembership:vi.fn()}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
const membership=vi.mocked(getCurrentMembership),tenantDb=vi.mocked(getTenantDb);
const readResponse=()=>new Response("sensitive-fictional-data",{status:200});
type FakeTx={
 membership:{findUnique:ReturnType<typeof vi.fn>};
 chessSecurityEvent:{create:ReturnType<typeof vi.fn>};
};
let tx:FakeTx,db:{$transaction:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.resetAllMocks();
 membership.mockResolvedValue({clerkUserId:"clerk-user",status:"ACTIVE",
  role:"MEMBER",email:null,displayName:null});
 tx={
  membership:{findUnique:vi.fn(async()=>({status:"ACTIVE",role:"MEMBER"}))},
  chessSecurityEvent:{create:vi.fn(async()=>({id:"evt"}))},
 };
 db={$transaction:vi.fn(async(fn:(tx:FakeTx)=>Promise<unknown>)=>fn(tx))};
 tenantDb.mockReturnValue({db:db as never,tenantId:"tenant-one",
  schemaName:"tenant_tenant_one"});
});

describe("Round 50 atomic historical GET audit",()=>{
 it("checks membership and SELECT in the SAME transaction then commits audit before release",async()=>{
  let wasScoped=false;
  const original=vi.fn(async()=>{
   wasScoped=Object.is(scopedHistoricalTenantClient("tenant-one","tenant_tenant_one"),tx);
   return readResponse();
  });
  const response=await withAuditedHistoricalGet("inventory/stock",original)();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("sensitive-fictional-data");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(wasScoped).toBe(true);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",maxWait:5000,timeout:30000,
  });
  expect(tx.membership.findUnique).toHaveBeenCalledWith({
   where:{clerkUserId:"clerk-user"},select:{status:true,role:true},
  });
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   actorClerkUserId:"clerk-user",
   action:"HISTORICAL_AUTHENTICATED_GET_ATOMIC",
   resourceType:"HistoricalApiRoute",resourceId:"inventory/stock",
   decision:"ALLOW",
  }});
  expect(JSON.stringify(tx.chessSecurityEvent.create.mock.calls)).not.toContain("sensitive-fictional-data");
 });
 it("refuses missing/revoked live membership before any SELECT",async()=>{
  const original=vi.fn(async()=>readResponse());
  membership.mockResolvedValueOnce(null);
  expect((await withAuditedHistoricalGet("chat/unread",original)()).status).toBe(403);
  expect(db.$transaction).not.toHaveBeenCalled();
  tx.membership.findUnique.mockResolvedValueOnce({status:"SUSPENDED",role:"MEMBER"});
  expect((await withAuditedHistoricalGet("chat/unread",original)()).status).toBe(403);
  expect(original).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({
   data:expect.objectContaining({decision:"DENY"}),
  });
 });
 it("fails closed if data was assembled outside tracked tenant transaction",async()=>{
  const response=await withAuditedHistoricalGet("helpdesk/tickets",async()=>readResponse())();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("sensitive-fictional-data");
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("fails closed on audit error, commit rejection or SELECT throwing",async()=>{
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit unavailable"));
  const route=withAuditedHistoricalGet("helpdesk/tickets",async()=>{
   scopedHistoricalTenantClient("tenant-one","tenant_tenant_one");
   return readResponse();
  });
  let r=await route();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain("sensitive-fictional-data");
  db.$transaction.mockRejectedValueOnce(new Error("serialization retry exhausted"));
  r=await route();
  expect(r.status).toBe(503);
  r=await withAuditedHistoricalGet("inventory/stock",async()=>{
   throw new Error("private source failed");
  })();
  expect(r.status).toBe(503);
 });
 it("audits a 404 denial within the SAME transaction",async()=>{
  const route=withAuditedHistoricalGet("inventory/stock",async()=>{
   scopedHistoricalTenantClient("tenant-one","tenant_tenant_one");
   return new Response("Not found",{status:404});
  });
  expect((await route()).status).toBe(404);
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({
   data:expect.objectContaining({decision:"DENY"}),
  });
 });
 it("only routes with independently audited source selects may use the special wrapper",async()=>{
  expect(()=>withAuditedHistoricalGet("client-profiles",async()=>readResponse())).toThrow();
  expect(()=>withAlreadyAuditedHistoricalGet("inventory/stock",async()=>readResponse())).toThrow();
  const response=await withAlreadyAuditedHistoricalGet("client-profiles",async()=>readResponse())();
  expect(response.status).toBe(200);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it("rejects path traversal and invalid audit labels",()=>{
  expect(()=>withAuditedHistoricalGet("../foreign",async()=>readResponse())).toThrow();
  expect(()=>withAuditedHistoricalGet("bad//route",async()=>readResponse())).toThrow();
 });
});
