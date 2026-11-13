import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({
 principal:vi.fn(),tenant:vi.fn(),scope:vi.fn(),
}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:mocks.tenant}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:mocks.principal,
}));
vi.mock("@/lib/db/historical-read-scope",()=>({
 withHistoricalTenantWriteScope:mocks.scope,
}));
import { withAuditedHistoricalMutation } from "./historical-mutation-response-audit-round57";

function fixture() {
 const tx={
  membership:{findUnique:vi.fn().mockResolvedValue({status:"ACTIVE",role:"ADMIN"})},
  chessSecurityEvent:{create:vi.fn().mockResolvedValue({id:"audit-a"})},
 };
 const db={$transaction:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>,_opts?:unknown)=>cb(tx))};
 mocks.principal.mockResolvedValue({clerkUserId:"actor-a",role:"ADMIN",status:"ACTIVE"});
 mocks.tenant.mockReturnValue({db,tenantId:"chess-demo",schemaName:"tenant_chess_demo"});
 mocks.scope.mockImplementation(async(_args:unknown,cb:(scope:unknown)=>Promise<unknown>)=>
  cb({accesses:1,closed:false}));
 return {tx,db};
}
describe("Round 57 authenticated historical REST mutation atomic release",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("audits the exact route and returns success only after event insertion",async()=>{
  const {tx,db}=fixture();
  const handler=withAuditedHistoricalMutation(
   "forms2/[id]/fields","POST",async()=>new Response('{"ok":true}',{status:201}));
  const result=await handler();
  expect(result.status).toBe(201);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   actorClerkUserId:"actor-a",
   action:"HISTORICAL_AUTHENTICATED_MUTATION_ATOMIC",
   resourceType:"HistoricalApiMutation",
   resourceId:"POST forms2/[id]/fields",decision:"ALLOW",
  }});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   expect.objectContaining({isolationLevel:"Serializable"}));
 });
 it("denies an unauthenticated actor before acquiring tenant DB",async()=>{
  fixture();
  mocks.principal.mockResolvedValue(null);
  const handler=withAuditedHistoricalMutation("forms2","POST",
   async()=>new Response("unreachable"));
  expect((await handler()).status).toBe(403);
  expect(mocks.tenant).not.toHaveBeenCalled();
 });
 it("denies a revoked membership inside the same write transaction",async()=>{
  const {tx}=fixture();
  tx.membership.findUnique.mockResolvedValue({status:"SUSPENDED",role:"ADMIN"});
  const handler=withAuditedHistoricalMutation("forms2","POST",
   async()=>new Response("leak"));
  expect((await handler()).status).toBe(403);
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("never releases a successful response without an audit commit",async()=>{
  const {tx}=fixture();
  tx.chessSecurityEvent.create.mockRejectedValue(new Error("audit unavailable"));
  const handler=withAuditedHistoricalMutation("forms2","DELETE",
   async()=>new Response('{"secret":"data"}'));
  const result=await handler();
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("secret");
 });
 it("rolls back if the original action returns failure or bypasses tenant binding",async()=>{
  const {tx}=fixture();
  const failed=withAuditedHistoricalMutation("sites","PATCH",
   async()=>new Response("bad request",{status:400}));
  expect((await failed()).status).toBe(400);
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
  mocks.scope.mockImplementation(async(_args:unknown,cb:(scope:unknown)=>Promise<unknown>)=>
   cb({accesses:0,closed:false}));
  const escaped=withAuditedHistoricalMutation("sites","POST",
   async()=>new Response('{"secret":"data"}'));
  expect((await escaped()).status).toBe(503);
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects unsafe event identifiers before accepting the handler",()=>{
  expect(()=>withAuditedHistoricalMutation("../foreign","POST",
   async()=>new Response("oops"))).toThrow("Unsafe");
 });
});
