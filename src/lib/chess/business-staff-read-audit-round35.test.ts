import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {getChessBusinessAssignmentAdmin} from "./business-units";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
beforeEach(()=>vi.clearAllMocks());

function setup(currentRole="OWNER",currentStatus="ACTIVE"){
 const events:unknown[]=[];
 const tx={
  membership:{
   findUnique:vi.fn(async()=>({role:currentRole,status:currentStatus})),
   findMany:vi.fn(async()=>[{
    clerkUserId:"staff-1",displayName:"Fictional staff",role:"MEMBER",
   }]),
  },
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:"ACTIVE"}))},
  chessEmployeeAssignment:{findMany:vi.fn(async()=>[{
   id:"assignment-1",clerkUserId:"staff-1",role:"SUPPORT",
   assignedAt:new Date("2026-11-11T00:00:00Z"),
  }])},
  chessSecurityEvent:{create:vi.fn(async(data:unknown)=>{events.push(data);})},
 };
 const db={
  chessBusinessUnit:{findUnique:vi.fn(async()=>({
   status:"ACTIVE",assignments:[],
  }))},
  $transaction:vi.fn(async (cb:(client:unknown)=>Promise<unknown>,
    _opts:unknown)=>cb(tx)),
 };
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"owner-1",role:"OWNER",status:"ACTIVE",
 } as never);
 return {events,tx,db};
}

describe("Round 35 M2 staff provisioning directory audit",()=>{
 it("audits the ALLOW and includes only staff directory fields",async()=>{
  const {events,tx,db}=setup();
  const result=await getChessBusinessAssignmentAdmin("bookkeeping");
  expect(result.members).toEqual([{
   clerkUserId:"staff-1",displayName:"Fictional staff",role:"MEMBER",
  }]);
  expect(result.assignments).toHaveLength(1);
  expect(tx.membership.findMany).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
  expect(events).toEqual([{data:{
   businessId:"bookkeeping",actorClerkUserId:"owner-1",
   action:"BUSINESS_STAFF_ADMIN_READ",resourceType:"ChessEmployeeAssignment",
   resourceId:"business:bookkeeping",decision:"ALLOW",
  }}]);
  expect(JSON.stringify(events)).not.toContain("staff-1");
 });
 it("rechecks current owner role and writes DENY without selecting staff",async()=>{
  const {events,tx}=setup("MEMBER");
  await expect(getChessBusinessAssignmentAdmin("bookkeeping")).rejects.toThrow();
  expect(tx.membership.findMany).not.toHaveBeenCalled();
  expect(tx.chessEmployeeAssignment.findMany).not.toHaveBeenCalled();
  expect(events).toEqual([{data:expect.objectContaining({
   action:"BUSINESS_STAFF_ADMIN_READ",decision:"DENY",
  })}]);
 });
 it("rejects suspended owner and inactive unit in the same read snapshot",async()=>{
  for(const [role,status,unit] of [
   ["OWNER","SUSPENDED","ACTIVE"],["OWNER","ACTIVE","INACTIVE"],
  ]){
   vi.clearAllMocks();
   const {tx,events}=setup(role,status);
   tx.chessBusinessUnit.findUnique.mockResolvedValueOnce({status:unit!});
   await expect(getChessBusinessAssignmentAdmin("bookkeeping")).rejects.toThrow();
   expect(tx.membership.findMany).not.toHaveBeenCalled();
   expect(events).toEqual([{data:expect.objectContaining({decision:"DENY"})}]);
  }
 });
 it("fails closed if audit insertion fails, even when staff SELECT succeeded",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("Audit storage offline"));
  await expect(getChessBusinessAssignmentAdmin("bookkeeping"))
   .rejects.toThrow("Audit storage offline");
 });
});
