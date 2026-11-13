import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {assignEmployee,createBusinessUnit} from "./business-units";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
beforeEach(()=>vi.clearAllMocks());
function setup(options:{ownerRole?:string;ownerStatus?:string;employeeStatus?:string;employeeRole?:string;unitStatus?:string}={}){
 const assigned={id:"assignment-1",businessId:"unit-1",clerkUserId:"staff-1",
  role:"SUPPORT",revokedAt:null};
 const tx={
  membership:{findUnique:vi.fn(async(arg:{where:{clerkUserId:string}})=>arg.where.clerkUserId==="owner-1"?
   {status:options.ownerStatus??"ACTIVE",role:options.ownerRole??"OWNER"}:
   {status:options.employeeStatus??"ACTIVE",role:options.employeeRole??"MEMBER"})},
  chessBusinessUnit:{
   findUnique:vi.fn(async()=>({status:options.unitStatus??"ACTIVE"})),
   create:vi.fn(async()=>({
    id:"created-unit",slug:"created-unit",name:"Created unit",
    legalName:null,status:"ACTIVE",
   })),
  },
  chessEmployeeAssignment:{upsert:vi.fn(async()=>assigned)},
  chessSecurityEvent:{create:vi.fn(async()=>({id:"audit-1"}))},
 };
 const db={$transaction:vi.fn(async(cb:(client:unknown)=>Promise<unknown>)=>cb(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"owner-1",role:"OWNER",status:"ACTIVE",
 } as never);
 return {tx,db,assigned};
}
const input={businessId:"unit-1",clerkUserId:"staff-1",role:"SUPPORT"};

describe("Round 35 M2 business unit provisioning",()=>{
 it("creates unit and audit in one serializable transaction",async()=>{
  const {db,tx}=setup();
  const result=await createBusinessUnit({
   slug:"created-unit",name:"Created unit",
  });
  expect(result.id).toBe("created-unit");
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   businessId:"created-unit",actorClerkUserId:"owner-1",
   action:"BUSINESS_UNIT_CREATED",resourceType:"ChessBusinessUnit",
   resourceId:"created-unit",decision:"ALLOW",
  }});
 });
 it("prevents stale-owner unit creation and refuses a failed audit event",async()=>{
  const revoked=setup({ownerRole:"MEMBER"});
  await expect(createBusinessUnit({slug:"new-unit",name:"New unit"}))
   .rejects.toThrow();
  expect(revoked.tx.chessBusinessUnit.create).not.toHaveBeenCalled();
  const permitted=setup();
  permitted.tx.chessSecurityEvent.create.mockRejectedValueOnce(
   new Error("audit unavailable"),
  );
  await expect(createBusinessUnit({slug:"new-unit",name:"New unit"}))
   .rejects.toThrow("audit unavailable");
 });
});

describe("Round 35 M2 employee access provisioning",()=>{
 it("makes assignment creation and source audit one serializable operation",async()=>{
  const {tx,db,assigned}=setup();
  const result=await assignEmployee(input);
  expect(result).toEqual(assigned);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(tx.chessEmployeeAssignment.upsert).toHaveBeenCalledTimes(1);
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   businessId:"unit-1",actorClerkUserId:"owner-1",
   action:"BUSINESS_EMPLOYEE_ASSIGNED",
   resourceType:"ChessEmployeeAssignment",resourceId:"assignment-1",
   decision:"ALLOW",
  }});
 });
 it("denies a revoked owner before modifying any staff assignment",async()=>{
  const {tx}=setup({ownerRole:"MEMBER"});
  await expect(assignEmployee(input)).rejects.toThrow();
  expect(tx.chessEmployeeAssignment.upsert).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects suspended target and inactive business before modifying membership",async()=>{
  for(const options of [
   {employeeStatus:"SUSPENDED"},{employeeRole:"VIEWER"},
   {unitStatus:"INACTIVE"},{ownerStatus:"SUSPENDED"},
  ]){
   vi.clearAllMocks();
   const {tx}=setup(options);
   await expect(assignEmployee(input)).rejects.toThrow();
   expect(tx.chessEmployeeAssignment.upsert).not.toHaveBeenCalled();
  }
 });
 it("fails the entire transaction when the append-only audit writer fails",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit unavailable"));
  await expect(assignEmployee(input)).rejects.toThrow("audit unavailable");
 });
});
