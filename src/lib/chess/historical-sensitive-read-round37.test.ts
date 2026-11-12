import {describe,it,expect,vi} from "vitest";
import {auditedHistoricalTenantRead} from "./historical-sensitive-read";

function setup(role="MEMBER",status="ACTIVE"){
 const tx={
  membership:{findUnique:vi.fn(async()=>({role,status}))},
  chessSecurityEvent:{create:vi.fn(async()=>({id:"event-1"}))},
 };
 const db={$transaction:vi.fn(async(callback:(tx:unknown)=>Promise<unknown>)=>callback(tx))};
 const read=vi.fn(async()=>({secret:"private-information"}));
 return {tx,db,read};
}
describe("Round 37 historical sensitive-read transaction audit",()=>{
 it("commits privacy-minimal ALLOW with selected records",async()=>{
  const {tx,db,read}=setup();
  const value=await auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"staff-a",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",
  },read);
  expect(value.secret).toBe("private-information");
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
   isolationLevel:"Serializable",
  });
  expect(tx.membership.findUnique).toHaveBeenCalledWith({
   where:{clerkUserId:"staff-a"},select:{status:true,role:true},
  });
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   actorClerkUserId:"staff-a",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",decision:"ALLOW",
  }});
  expect(JSON.stringify(tx.chessSecurityEvent.create.mock.calls)).not.toContain("private-information");
 });
 it.each(["INVITED","SUSPENDED"])("denies %s and does not query records",async status=>{
  const {tx,db,read}=setup("MEMBER",status);
  await expect(auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"staff-a",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",
  },read)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({decision:"DENY"})});
 });
 it("rejects a current VIEWER even if upstream checks were stale",async()=>{
  const {tx,db,read}=setup("VIEWER");
  await expect(auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"staff-a",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",
  },read)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).toHaveBeenCalled();
 });
 it("does not release data when the event insert fails",async()=>{
  const {tx,db,read}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit offline"));
  await expect(auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"staff-a",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",
  },read)).rejects.toThrow("audit offline");
  expect(read).toHaveBeenCalledOnce();
 });
 it("never allows unknown identities, even if a mock would return membership",async()=>{
  const {tx,db,read}=setup();
  await expect(auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"",action:"HISTORICAL_DOCUMENT_READ",
   resourceType:"Document",resourceId:"document-a",
  },read)).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("allows only specified roles for regulated legacy reads",async()=>{
  const {tx,db,read}=setup("MEMBER");
  await expect(auditedHistoricalTenantRead(db as never,{
   actorClerkUserId:"staff-a",action:"HISTORICAL_FORM_SUBMISSIONS_READ",
   resourceType:"FormSubmission",resourceId:"form-a",
   allowedRoles:["OWNER","ADMIN"],
  },read)).rejects.toThrow();
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:expect.objectContaining({decision:"DENY"})});
 });
});
