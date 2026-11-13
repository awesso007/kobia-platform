import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {createClientProfile,createClientServiceLink,setClientServiceGrant,revokeClientServiceGrant} from "./service";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 requirePermission:vi.fn(async()=>{}),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("@/lib/chess/business-units",()=>({
 assertBusinessAccess:vi.fn(async()=>{}),
}));
beforeEach(()=>vi.clearAllMocks());
function setup(liveRole="OWNER",unitStatus="ACTIVE"){
 const events:unknown[]=[];
 const tx={
  membership:{findUnique:vi.fn(async(
   a:{where:{clerkUserId:string}},
  )=>a.where.clerkUserId==="owner-1"?{
   status:"ACTIVE",role:liveRole,
  }:{status:"ACTIVE",role:"MEMBER"})},
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:unitStatus}))},
  contact:{findUnique:vi.fn(async()=>({id:"contact-1"}))},
  clientProfile:{
   create:vi.fn(async()=>({
    id:"profile-created",ownerClerkUserId:"owner-1",
    displayName:"Fictional Client",contactId:"contact-1",
    createdAt:new Date(),updatedAt:new Date(),
   })),
   findUnique:vi.fn(async()=>({
   id:"profile-1",ownerClerkUserId:"owner-1",
   displayName:"Fictional Client",contactId:null,
   createdAt:new Date(),updatedAt:new Date(),
  }))},
  clientServiceLink:{
   upsert:vi.fn(async()=>({
    id:"link-1",profileId:"profile-1",
    businessId:"unit-1",service:"BOOKKEEPING",
   })),
   findUnique:vi.fn(async()=>({businessId:"unit-1"})),
  },
  clientServiceGrant:{
   upsert:vi.fn(async()=>({id:"grant-1"})),
   updateMany:vi.fn(async()=>({count:1})),
  },
  chessSecurityEvent:{create:vi.fn(async(event:unknown)=>{
   events.push(event);return {id:"audit-1"};
  })},
 };
 const db={
  $transaction:vi.fn(async(cb:(client:unknown)=>Promise<unknown>)=>cb(tx)),
  membership:{findUnique:vi.fn(async()=>({status:"ACTIVE",role:"MEMBER"}))},
  clientServiceLink:{findUnique:vi.fn(async()=>({
   id:"link-1",businessId:"unit-1",
  }))},
 };
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"owner-1",role:"OWNER",status:"ACTIVE",
 } as never);
 return {tx,db,events};
}
describe("Round 35 M1 profile creation authorization",()=>{
 it("rechecks active tenant role and contact before writing a profile with audit",async()=>{
  const {tx,db,events}=setup();
  const profile=await createClientProfile({
   displayName:"Fictional Client",contactId:"contact-1",
  });
  expect(profile.id).toBe("profile-created");
  expect(tx.contact.findUnique).toHaveBeenCalledWith({
   where:{id:"contact-1"},select:{id:true},
  });
  expect(events).toEqual([{data:expect.objectContaining({
   action:"CLIENT_PROFILE_CREATED",resourceId:"profile-created",decision:"ALLOW",
  })}]);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
 });
 it("rejects revoked tenant access before creating a profile",async()=>{
  const {tx}=setup("VIEWER");
  await expect(createClientProfile({displayName:"Fictional Client"}))
   .rejects.toThrow();
  expect(tx.clientProfile.create).not.toHaveBeenCalled();
 });
});

describe("Round 35 M1 service link/grant write authorization",()=>{
 it("pins new service links to a current owner and a committed audit event",async()=>{
  const {db,tx,events}=setup();
  const result=await createClientServiceLink("profile-1","unit-1","BOOKKEEPING");
  expect(result.id).toBe("link-1");
  expect(tx.clientServiceLink.upsert).toHaveBeenCalledTimes(1);
  expect(events).toContainEqual({data:expect.objectContaining({
   action:"SERVICE_LINK_PROVISIONED",resourceId:"link-1",decision:"ALLOW",
  })});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
 });
 it("refuses link provisioning when the administrator loses its role",async()=>{
  const {tx}=setup("MEMBER");
  await expect(createClientServiceLink("profile-1","unit-1","BOOKKEEPING"))
   .rejects.toThrow();
  expect(tx.clientServiceLink.upsert).not.toHaveBeenCalled();
 });
 it("permits a service grant only after a fresh target and business check",async()=>{
  const {tx,db}=setup();
  const granted=await setClientServiceGrant("link-1","staff-1",{
   canRead:true,canWrite:false,
  });
  expect(granted.id).toBe("grant-1");
  expect(tx.membership.findUnique).toHaveBeenCalledTimes(2);
  expect(tx.clientServiceGrant.upsert).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
 });
 it("prevents stale-owner grant creation and revocation",async()=>{
  const {tx}=setup("MEMBER");
  await expect(setClientServiceGrant("link-1","staff-1",{
   canRead:true,canWrite:false,
  })).rejects.toThrow();
  await expect(revokeClientServiceGrant("link-1","staff-1"))
   .rejects.toThrow();
  expect(tx.clientServiceGrant.upsert).not.toHaveBeenCalled();
  expect(tx.clientServiceGrant.updateMany).not.toHaveBeenCalled();
 });
 it("prevents inactive-business mutation and fails closed on a broken audit ledger",async()=>{
  const blocked=setup("OWNER","INACTIVE");
  await expect(revokeClientServiceGrant("link-1","staff-1")).rejects.toThrow();
  expect(blocked.tx.clientServiceGrant.updateMany).not.toHaveBeenCalled();
  const approved=setup();
  approved.tx.chessSecurityEvent.create.mockRejectedValueOnce(
   new Error("audit unavailable"),
  );
  await expect(revokeClientServiceGrant("link-1","staff-1"))
   .rejects.toThrow("audit unavailable");
 });
});
