import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
 principal:vi.fn(),context:vi.fn(),liveActor:vi.fn(),scope:vi.fn(),
}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:mocks.context}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:mocks.principal,
 PermissionError:class PermissionError extends Error{
  constructor(action:string){super("Forbidden: "+action)}
 },
}));
vi.mock("@/lib/db/historical-read-scope",()=>({
 withHistoricalTenantReadScope:mocks.scope,
}));
vi.mock("./legacy-lead-security-round54",()=>({
 liveLegacyLeadActor:mocks.liveActor,
}));
import {
 assertHistoricalWideClientRead,withAuditedHistoricalServerRead,
} from "./historical-server-read-round58";

function fixture(){
 const tx={
  clientProfile:{count:vi.fn().mockResolvedValue(0)},
  clientServiceLink:{count:vi.fn().mockResolvedValue(0)},
  chessSecurityEvent:{create:vi.fn().mockResolvedValue({id:"receipt"})},
 };
 const db={$transaction:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx))};
 mocks.principal.mockResolvedValue({clerkUserId:"actor-a",status:"ACTIVE"});
 mocks.context.mockReturnValue({db,tenantId:"chess-demo",schemaName:"tenant_chess_demo"});
 mocks.liveActor.mockResolvedValue({id:"actor-a",role:"ADMIN",businessId:"unit-a"});
 mocks.scope.mockImplementation(async(_ctx:unknown,cb:(scope:unknown)=>Promise<unknown>)=>
  cb({accesses:1,closed:false}));
 return {tx,db};
}
describe("Round 58 tenant, client service and audit-coupled server reads",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("allows only admin/owner and audits before releasing sensitive data",async()=>{
  const {tx,db}=fixture();
  const query=withAuditedHistoricalServerRead("marketing.listBroadcasts",
   async()=>[{recipient:"private@fictional.test"}]);
  expect(await query()).toEqual([{recipient:"private@fictional.test"}]);
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   businessId:"unit-a",actorClerkUserId:"actor-a",
   action:"HISTORICAL_SERVER_SENSITIVE_READ_ATOMIC",
   resourceType:"LegacyServerRead",
   resourceId:"marketing.listBroadcasts",decision:"ALLOW",
  }});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   expect.objectContaining({isolationLevel:"Serializable"}));
 });
 it("denies MEMBER-wide aggregation even where a client grant exists",async()=>{
  const {tx}=fixture();
  mocks.liveActor.mockResolvedValue({id:"actor-a",role:"MEMBER",businessId:"unit-a"});
  await expect(withAuditedHistoricalServerRead("marketing.getMarketingOverview",
   async()=>({subscribers:99}))()).rejects.toThrow("Forbidden");
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects missing service link for any client, even an OWNER",async()=>{
  const {tx}=fixture();
  tx.clientProfile.count.mockResolvedValue(1);
  await expect(withAuditedHistoricalServerRead("quotes.getQuotes",
   async()=>[{email:"secret"}])()).rejects.toThrow("Forbidden");
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("denies missing grant, revoked grant or a foreign business service",async()=>{
  const {tx}=fixture();
  tx.clientServiceLink.count.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
  await expect(withAuditedHistoricalServerRead("documents.getDocument",
   async()=>({url:"private"}))()).rejects.toThrow("Forbidden");
  expect(tx.clientServiceLink.count).toHaveBeenNthCalledWith(2,{
   where:{OR:[
    {businessId:{not:"unit-a"}},
    {grants:{none:{clerkUserId:"actor-a",revokedAt:null,canRead:true}}},
   ]},
  });
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("requires a mapped business when any service link exists",async()=>{
  const {tx}=fixture();
  mocks.liveActor.mockResolvedValue({id:"actor-a",role:"ADMIN",businessId:null});
  tx.clientServiceLink.count.mockResolvedValue(2);
  await expect(assertHistoricalWideClientRead(tx as never,
   {id:"actor-a",role:"ADMIN",businessId:null})).rejects.toThrow("Forbidden");
 });
 it("refuses stale login before tenant access",async()=>{
  fixture();
  mocks.principal.mockResolvedValue({clerkUserId:"actor-a",status:"INACTIVE"});
  await expect(withAuditedHistoricalServerRead("mail.loadThreadView",
   async()=>({secret:"message"}))()).rejects.toThrow("Forbidden");
  expect(mocks.context).not.toHaveBeenCalled();
 });
 it("never releases a result if event insert fails or SELECT bypasses tenant transaction",async()=>{
  const {tx}=fixture();
  tx.chessSecurityEvent.create.mockRejectedValue(new Error("audit database unavailable"));
  await expect(withAuditedHistoricalServerRead("settings/audit.listAuditEntries",
   async()=>({raw:"private"}))()).rejects.toThrow("audit database unavailable");
  tx.chessSecurityEvent.create.mockReset().mockResolvedValue({id:"receipt"});
  mocks.scope.mockImplementation(async(_ctx:unknown,cb:(scope:unknown)=>Promise<unknown>)=>
   cb({accesses:0,closed:false}));
  await expect(withAuditedHistoricalServerRead("quotes.getQuoteBuilder",
   async()=>({raw:"private"}))()).rejects.toThrow("escaped");
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects unsafe audit resource identifiers",()=>{
  expect(()=>withAuditedHistoricalServerRead("../foreign",async()=>true))
   .toThrow("Unsafe");
 });
});
