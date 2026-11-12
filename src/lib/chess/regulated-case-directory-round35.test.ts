import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {listChessAuthorizedRegulatedCases} from "./regulated-case-directory";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("./business-units",()=>({assertBusinessAccess:vi.fn(async()=>{})}));
beforeEach(()=>vi.clearAllMocks());

function setup(opts:{
 role?:string;status?:string;owner?:string;grant?:boolean;
 consent?:boolean;assigned?:boolean;
}={}){
 const events:unknown[]=[];
 const tx={
  membership:{findUnique:vi.fn(async()=>({
   role:opts.role??"MEMBER",status:opts.status??"ACTIVE",
  }))},
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:"ACTIVE"}))},
  chessEmployeeAssignment:{findUnique:vi.fn(async()=>({
   revokedAt:opts.assigned===false?new Date():null,
  }))},
  chessServiceCase:{findMany:vi.fn(async()=>[{
   id:"case-1",clientProfileId:"profile-1",service:"MORTGAGE",
  }])},
  clientProfile:{findUnique:vi.fn(async()=>({
   ownerClerkUserId:opts.owner??"staff-1",
  }))},
  clientServiceLink:{findUnique:vi.fn(async()=>({
   grants:opts.grant===false?[]:[{id:"grant-1"}],
  }))},
  chessClientConsent:{findMany:vi.fn(async()=>[{
   status:opts.consent===false?"PENDING":"GRANTED",
   expiresAt:null,consentedAt:new Date("2026-11-01T00:00:00Z"),
   acceptedByClerkUserId:"client-1",verifiedEmailDigest:"a".repeat(64),
   acceptanceEvidenceDigest:"b".repeat(64),withdrawnAt:null,
  }])},
  chessSecurityEvent:{create:vi.fn(async(data:unknown)=>{events.push(data);})},
 };
 const db={$transaction:vi.fn(async(cb:(client:unknown)=>Promise<unknown>)=>cb(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"staff-1",role:"MEMBER",status:"ACTIVE",
 } as never);
 return {tx,db,events};
}
describe("Round 35 M1/M6/M8 regulated case read privacy",()=>{
 it("returns only case id and service after a single committed current grant/consent audit",async()=>{
  const {tx,db,events}=setup();
  const result=await listChessAuthorizedRegulatedCases("unit-1");
  expect(result).toEqual([{id:"case-1",service:"MORTGAGE"}]);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
  expect(events).toEqual([{data:expect.objectContaining({
   action:"REGULATED_CASE_DIRECTORY_READ",decision:"ALLOW",
   resourceId:"business:unit-1",
  })}]);
  expect(tx.clientServiceLink.findUnique).toHaveBeenCalledWith({
   where:{profileId_businessId_service:{
    profileId:"profile-1",businessId:"unit-1",service:"MORTGAGE",
   }},select:{grants:{where:{
    clerkUserId:"staff-1",canRead:true,revokedAt:null,
   },select:{id:true}}},
  });
  expect(JSON.stringify(result)).not.toContain("profile-1");
  expect(JSON.stringify(events)).not.toContain("profile-1");
 });
 it("does not return another person's profile even with a link and consent",async()=>{
  const {tx,events}=setup({owner:"other-staff"});
  expect(await listChessAuthorizedRegulatedCases("unit-1")).toEqual([]);
  expect(tx.chessServiceCase.findMany).toHaveBeenCalled();
  expect(events).toEqual([{data:expect.objectContaining({decision:"ALLOW"})}]);
 });
 it("hides revoked grants and pending consent as an empty authorized list",async()=>{
  for(const args of [{grant:false},{consent:false}]){
   vi.clearAllMocks();
   setup(args);
   expect(await listChessAuthorizedRegulatedCases("unit-1")).toEqual([]);
  }
 });
 it("denies a revoked employee before reading any service cases",async()=>{
  const {tx,events}=setup({assigned:false});
  await expect(listChessAuthorizedRegulatedCases("unit-1")).rejects.toThrow();
  expect(tx.chessServiceCase.findMany).not.toHaveBeenCalled();
  expect(events).toEqual([{data:expect.objectContaining({decision:"DENY"})}]);
 });
 it("fails closed if the immutable tenant event cannot be appended",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit offline"));
  await expect(listChessAuthorizedRegulatedCases("unit-1"))
   .rejects.toThrow("audit offline");
 });
});
