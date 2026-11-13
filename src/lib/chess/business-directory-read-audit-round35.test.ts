import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listBusinessUnits} from "./business-units";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
beforeEach(()=>vi.clearAllMocks());
function setup(role="MEMBER",status="ACTIVE",count=1){
 const events:unknown[]=[];
 const findMany=vi.fn(async()=>Array.from({length:count},(_,i)=>({
  id:"unit-"+i,slug:"business-"+i,name:"Business "+i,status:"ACTIVE",
 })));
 const tx={
  membership:{findUnique:vi.fn(async()=>({role,status}))},
  chessBusinessUnit:{findMany},
  chessSecurityEvent:{create:vi.fn(async(entry:unknown)=>{events.push(entry);})},
 };
 const db={$transaction:vi.fn(async(cb:(client:unknown)=>Promise<unknown>)=>cb(tx))};
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"staff-1",role:"MEMBER",status:"ACTIVE",
 } as never);
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 return {tx,db,events,findMany};
}
describe("Round 35 M1/M2 scoped business directory",()=>{
 it("filters MEMBER listings by active assignment inside the audit transaction",async()=>{
  const {findMany,events,db}=setup();
  const result=await listBusinessUnits();
  expect(result).toHaveLength(1);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{status:"ACTIVE",assignments:{some:{
    clerkUserId:"staff-1",revokedAt:null,
   }}},take:101,
  }));
  expect(events).toEqual([{data:{
   actorClerkUserId:"staff-1",action:"BUSINESS_UNIT_DIRECTORY_READ",
   resourceType:"ChessBusinessUnit",resourceId:"ACTIVE_UNITS",decision:"ALLOW",
  }}]);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
 });
 it("owner sees active units without the member assignment filter",async()=>{
  const {findMany}=setup("OWNER");
  const results=await listBusinessUnits();
  expect(results).toHaveLength(1);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{status:"ACTIVE"},
  }));
 });
 it("records denied access when current membership is revoked before SELECT",async()=>{
  const {findMany,events}=setup("VIEWER");
  await expect(listBusinessUnits()).rejects.toThrow();
  expect(findMany).not.toHaveBeenCalled();
  expect(events).toEqual([{data:expect.objectContaining({decision:"DENY"})}]);
 });
 it("does not silently truncate the business directory at the safe cap",async()=>{
  const {findMany}=setup("OWNER","ACTIVE",101);
  await expect(listBusinessUnits()).rejects.toThrow("paging cap");
  expect(findMany).toHaveBeenCalledTimes(1);
 });
 it("fails closed without returning business names when audit storage fails",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("Audit unavailable"));
  await expect(listBusinessUnits()).rejects.toThrow("Audit unavailable");
 });
});
