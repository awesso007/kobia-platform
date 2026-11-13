import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listChessActionApprovals} from "./approvals";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("./business-units",()=>({assertBusinessAccess:vi.fn(async()=>{})}));
beforeEach(()=>vi.clearAllMocks());
function setup(role="MEMBER",assignment="SUPPORT",revoked=false){
 const events:unknown[]=[];
 const findMany=vi.fn(async()=>[{
  id:"request-1",actionType:"INTERNAL_PROCESS_REVIEW",
  requestedBy:"other-staff",reviewedBy:null,status:"PENDING",
  createdAt:new Date("2026-11-11T11:00:00Z"),reviewedAt:null,
 }]);
 const tx={
  membership:{findUnique:vi.fn(async()=>({role,status:"ACTIVE"}))},
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:"ACTIVE"}))},
  chessEmployeeAssignment:{findUnique:vi.fn(async()=>({
   revokedAt:revoked?new Date():null,role:assignment,
  }))},
  chessActionApproval:{findMany},
  chessSecurityEvent:{create:vi.fn(async(input:unknown)=>{events.push(input);})},
 };
 const db={$transaction:vi.fn(async (cb:(client:unknown)=>Promise<unknown>)=>cb(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"staff-1",role:"MEMBER",status:"ACTIVE",
 } as never);
 return {db,tx,events,findMany};
}
describe("Round 35 supervised action inbox read audit",()=>{
 it("shows only own requests to an assigned SUPPORT and does not return employee IDs",async()=>{
  const {findMany,events,db}=setup();
  const results=await listChessActionApprovals("unit-1");
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{businessId:"unit-1",requestedBy:"staff-1"},
  }));
  expect(results[0]?.canReview).toBe(false);
  expect(JSON.stringify(results)).not.toContain("other-staff");
  expect(events).toEqual([{data:expect.objectContaining({
   decision:"ALLOW",action:"ACTION_APPROVAL_DIRECTORY_READ",
   resourceId:"business:unit-1",
  })}]);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
 });
 it("allows a current OWNER to see and independently review a request",async()=>{
  const {findMany,tx}=setup("OWNER");
  const result=await listChessActionApprovals("unit-1");
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{businessId:"unit-1"},
  }));
  expect(tx.membership.findUnique).toHaveBeenCalled();
  expect(result[0]?.canReview).toBe(true);
 });
 it("denies access and logs DENY after staff assignment revocation",async()=>{
  const {events,findMany}=setup("MEMBER","SUPPORT",true);
  await expect(listChessActionApprovals("unit-1")).rejects.toThrow();
  expect(findMany).not.toHaveBeenCalled();
  expect(events).toEqual([{data:expect.objectContaining({decision:"DENY"})}]);
 });
 it("limits a stale owner identity to current MEMBER scope, not a tenant-wide queue",async()=>{
  const {findMany}=setup("MEMBER","SUPPORT");
  vi.mocked(getCurrentMembership).mockResolvedValue({
   clerkUserId:"staff-1",role:"OWNER",status:"ACTIVE",
  } as never);
  const result=await listChessActionApprovals("unit-1");
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{businessId:"unit-1",requestedBy:"staff-1"},
  }));
  expect(result[0]?.canReview).toBe(false);
 });
 it("never returns a previously selected approval when the audit write fails",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit unavailable"));
  await expect(listChessActionApprovals("unit-1"))
   .rejects.toThrow("audit unavailable");
 });
});
