import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({member:vi.fn(),tenant:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:mocks.member,
 PermissionError:class PermissionError extends Error{constructor(action:string){super(action)}},
}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:mocks.tenant}));
import { appendChessSecurityEvent } from "./security-events";
function fixture(role="ADMIN",unitStatus="ACTIVE"){
 const tx={
  membership:{findUnique:vi.fn().mockResolvedValue({status:"ACTIVE",role})},
  chessBusinessUnit:{findUnique:vi.fn().mockResolvedValue({status:unitStatus})},
  chessSecurityEvent:{create:vi.fn().mockResolvedValue({id:"event",occurredAt:new Date()})},
 };
 const db={$transaction:vi.fn(async(cb:(tx:unknown)=>Promise<unknown>)=>cb(tx))};
 mocks.member.mockResolvedValue({clerkUserId:"actor-a",role,status:"ACTIVE"});
 mocks.tenant.mockReturnValue({db});
 return {db,tx};
}
describe("Round 57 immutable audit integrity",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("cannot fabricate system ALLOW/DENY events through operator input",async()=>{
  const {db,tx}=fixture();
  await expect(appendChessSecurityEvent({
   action:"FINANCIAL_PAYMENT_APPROVED",resourceType:"Payment",
   decision:"ALLOW",resourceId:"other-client",
  })).rejects.toThrow();
  await expect(appendChessSecurityEvent({
   action:"OPERATOR_SECURITY_REVIEW_REQUESTED",resourceType:"SecurityReview",
   decision:"DENY",
  })).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("records only live admin review in same transaction",async()=>{
  const {db,tx}=fixture();
  const result=await appendChessSecurityEvent({
   businessId:"unit-a",action:"OPERATOR_SECURITY_REVIEW_REQUESTED",
   resourceType:"SecurityReview",resourceId:"case-a",decision:"REVIEW",
  });
  expect(result.id).toBe("event");
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({
   data:{businessId:"unit-a",action:"OPERATOR_SECURITY_REVIEW_REQUESTED",
    resourceType:"SecurityReview",resourceId:"case-a",decision:"REVIEW",
    actorClerkUserId:"actor-a"},
   select:{id:true,occurredAt:true},
  });
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   expect.objectContaining({isolationLevel:"Serializable"}));
 });
 it("rejects stale membership and inactive business",async()=>{
  const noRole=fixture("MEMBER");
  await expect(appendChessSecurityEvent({
   action:"OPERATOR_SECURITY_REVIEW_REQUESTED",
   resourceType:"SecurityReview",decision:"REVIEW",
  })).rejects.toThrow();
  expect(noRole.tx.chessSecurityEvent.create).not.toHaveBeenCalled();
  const ctx=fixture("ADMIN","INACTIVE");
  await expect(appendChessSecurityEvent({
   businessId:"unit-a",action:"OPERATOR_SECURITY_REVIEW_REQUESTED",
   resourceType:"SecurityReview",decision:"REVIEW",
  })).rejects.toThrow();
  expect(ctx.tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("never reports success if audit database insert fails",async()=>{
  const {tx}=fixture();
  tx.chessSecurityEvent.create.mockRejectedValue(new Error("DB failure"));
  await expect(appendChessSecurityEvent({
   action:"OPERATOR_SECURITY_REVIEW_REQUESTED",
   resourceType:"SecurityReview",decision:"REVIEW",
  })).rejects.toThrow("DB failure");
 });
});
