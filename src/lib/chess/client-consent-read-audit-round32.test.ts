import {beforeEach,describe,expect,it,vi} from "vitest";
import {auth,currentUser} from "@clerk/nextjs/server";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getOwnClientConsent,listOwnClientConsents} from "./client-consent-self-service";

vi.mock("@clerk/nextjs/server",()=>({auth:vi.fn(),currentUser:vi.fn()}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));

const created=new Date("2026-11-11T10:00:00Z");
function consent(status="PENDING",acceptedByClerkUserId:string|null=null){
 return {id:"consent-test-101",businessId:"business-101",
  clientProfileId:"profile-101",purpose:"service:BOOKKEEPING",
  policyVersion:"v1",policyText:"A complete fictional consent text describing scope, use and withdrawal of shared records.",
  status,acceptedByClerkUserId,expiresAt:null,consentedAt:null,
  withdrawnAt:null,createdAt:created};
}
function setup(){
 const events:unknown[]=[];
 const tx={
  contact:{
   findMany:vi.fn(async (_options:unknown)=>[{id:"contact-101",email:"viewer@example.test"}]),
   findUnique:vi.fn(async (_options:unknown)=>({email:"viewer@example.test"})),
  },
  clientProfile:{
   findMany:vi.fn(async (_options:unknown)=>[{id:"profile-101"}]),
   findUnique:vi.fn(async (_options:unknown)=>({contactId:"contact-101"})),
  },
  chessClientConsent:{
   findMany:vi.fn(async (_options:unknown)=>[consent()]),
   findUnique:vi.fn(async (_options:unknown)=>consent()),
  },
  chessSecurityEvent:{create:vi.fn(async (input:{data:unknown})=>{
   events.push(input.data);return {id:"audit-row"};
  })},
 };
 const db={$transaction:vi.fn(async(
  callback:(client:typeof tx)=>Promise<unknown>,
  _options:unknown,
 )=>callback(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(auth).mockReturnValue({userId:"viewer-clerk-id"} as never);
 vi.mocked(currentUser).mockResolvedValue({
  id:"viewer-clerk-id",
  primaryEmailAddress:{emailAddress:"viewer@example.test",
   verification:{status:"verified"}},
 } as never);
 return {tx,events,db};
}
beforeEach(()=>vi.clearAllMocks());

describe("Round 32 M1/M3 consent portal signed-in read audits",()=>{
 it("lists only same-email pending records and filters another Clerk account grant",async()=>{
  const {tx,events,db}=setup();
  tx.chessClientConsent.findMany.mockResolvedValue([
   consent(),consent("GRANTED","somebody-else"),
  ]);
  const visible=await listOwnClientConsents();
  expect(visible).toHaveLength(1);
  expect(visible[0]).toMatchObject({id:"consent-test-101",status:"PENDING"});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(tx.chessClientConsent.findMany).toHaveBeenCalledWith(expect.objectContaining({
   select:expect.not.objectContaining({policyText:true}),
  }));
  expect(events).toEqual([{
   actorClerkUserId:"viewer-clerk-id",
   action:"CLIENT_CONSENT_DIRECTORY_READ",
   resourceType:"ChessClientConsent",resourceId:"SELF_DIRECTORY",
   decision:"ALLOW",
  }]);
  expect(JSON.stringify(events)).not.toContain("viewer@example");
  expect(JSON.stringify(events)).not.toContain("BOOKKEEPING");
 });
 it("still commits an audit for an empty consent directory",async()=>{
  const {tx,events}=setup();
  tx.contact.findMany.mockResolvedValue([]);
  expect(await listOwnClientConsents()).toEqual([]);
  expect(tx.clientProfile.findMany).not.toHaveBeenCalled();
  expect(events).toMatchObject([{decision:"ALLOW",resourceId:"SELF_DIRECTORY"}]);
 });
 it("rejects directory overflow with a committed DENY, no partial disclosure",async()=>{
  const {tx,events}=setup();
  tx.contact.findMany.mockResolvedValue(Array.from({length:101},(_,i)=>({
   id:"contact-"+i,email:"viewer@example.test",
  })));
  await expect(listOwnClientConsents()).rejects.toThrow();
  expect(tx.clientProfile.findMany).not.toHaveBeenCalled();
  expect(events).toMatchObject([{decision:"DENY",resourceId:"SELF_DIRECTORY"}]);
 });
 it("returns the exact consent text only after identity, email and grant checks",async()=>{
  const {events,db}=setup();
  const row=await getOwnClientConsent("consent-test-101");
  expect(row.policyText).toContain("complete fictional consent");
  expect(row.status).toBe("PENDING");
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(events).toEqual([{
   actorClerkUserId:"viewer-clerk-id",
   action:"CLIENT_CONSENT_DISCLOSURE_READ",
   resourceType:"ChessClientConsent",resourceId:"consent-test-101",
   decision:"ALLOW",
  }]);
  expect(JSON.stringify(events)).not.toContain("policyText");
 });
 it("denies wrong current CRM contact email and audits without leaking content",async()=>{
  const {tx,events}=setup();
  tx.contact.findUnique.mockResolvedValue({email:"unrelated@example.test"});
  await expect(getOwnClientConsent("consent-test-101")).rejects.toThrow();
  expect(events).toEqual([expect.objectContaining({
   resourceId:"consent-test-101",decision:"DENY",
  })]);
 });
 it("denies another identity's accepted consent even if the contact email matches",async()=>{
  const {tx,events}=setup();
  tx.chessClientConsent.findUnique.mockResolvedValue(consent("GRANTED","other-clerk"));
  await expect(getOwnClientConsent("consent-test-101")).rejects.toThrow();
  expect(events).toMatchObject([{decision:"DENY"}]);
 });
 it("invalid reference writes an opaque DENY without querying private records",async()=>{
  const {tx,events}=setup();
  await expect(getOwnClientConsent("../not-a-valid-id")).rejects.toThrow();
  expect(tx.chessClientConsent.findUnique).not.toHaveBeenCalled();
  expect(events).toMatchObject([{
   resourceId:"INVALID",action:"CLIENT_CONSENT_DISCLOSURE_READ",decision:"DENY",
  }]);
 });
 it("fails closed if the append-only audit ledger cannot commit",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValue(new Error("Audit unavailable"));
  await expect(getOwnClientConsent("consent-test-101"))
   .rejects.toThrow("Audit unavailable");
  await expect(listOwnClientConsents()).rejects.toThrow("Audit unavailable");
 });
 it("rejects a Clerk user without a verified primary email before any query",async()=>{
  const {db,events}=setup();
  vi.mocked(currentUser).mockResolvedValue({
   id:"viewer-clerk-id",
   primaryEmailAddress:{emailAddress:"viewer@example.test",
    verification:{status:"unverified"}},
  } as never);
  await expect(listOwnClientConsents()).rejects.toThrow();
  await expect(getOwnClientConsent("consent-test-101")).rejects.toThrow();
  expect(db.$transaction).not.toHaveBeenCalled();
  expect(events).toEqual([]);
 });
});
