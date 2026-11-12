import {describe,expect,it,vi} from "vitest";
import type {Prisma} from "@/lib/db/generated/tenant";
import {authorizeChessDocumentService} from "./document-service-authorization";
const digest="a".repeat(64);
const valid:{status:string;consentedAt:Date;expiresAt:Date|null;withdrawnAt:Date|null;
 acceptedByClerkUserId:string;verifiedEmailDigest:string;
 acceptanceEvidenceDigest:string|null}={status:"GRANTED",consentedAt:new Date("2026-10-01"),
 expiresAt:null,withdrawnAt:null,
 acceptedByClerkUserId:"signed-test-client",
 verifiedEmailDigest:digest,acceptanceEvidenceDigest:digest};
const opts={businessId:"unit",clientProfileId:"client",service:"TAX" as const,
 actorClerkUserId:"staff"};
function fakeTx(extra?:{memberStatus?:string;role?:string;unitStatus?:string;
 grant?:boolean;canWrite?:boolean;consents?:typeof valid[]}){
 const member={status:extra?.memberStatus??"ACTIVE",role:extra?.role??"MEMBER"};
 const unit={status:extra?.unitStatus??"ACTIVE"};
 const grants=extra?.grant===false?[]:[{canWrite:extra?.canWrite??false}];
 const tx={
  membership:{findUnique:vi.fn().mockResolvedValue(member)},
  chessBusinessUnit:{findUnique:vi.fn().mockResolvedValue(unit)},
  clientServiceLink:{findUnique:vi.fn().mockResolvedValue({grants})},
  chessClientConsent:{findMany:vi.fn().mockResolvedValue(extra?.consents??[valid])},
 };
 return tx as unknown as Prisma.TransactionClient;
}
describe("M3 document access requires live, purpose-bound consent as well as a grant",()=>{
 it("allows only an active explicit grantee with valid real evidence",async()=>{
  expect(await authorizeChessDocumentService(fakeTx(),opts))
   .toEqual({canWrite:false});
  expect(await authorizeChessDocumentService(fakeTx({canWrite:true}),
   {...opts,requireWrite:true})).toEqual({canWrite:true});
 });
 it("rejects revoked, unsigned, withdrawn, expired, wrong-role and inactive accesses",async()=>{
  for(const tx of [
   fakeTx({grant:false}),fakeTx({role:"VIEWER"}),
   fakeTx({memberStatus:"SUSPENDED"}),fakeTx({unitStatus:"SUSPENDED"}),
   fakeTx({consents:[]}),fakeTx({consents:[{...valid,status:"PENDING"}]}),
   fakeTx({consents:[{...valid,withdrawnAt:new Date("2026-11-01")}]}),
   fakeTx({consents:[{...valid,expiresAt:new Date("2026-11-01")}]}),
   fakeTx({consents:[{...valid,acceptanceEvidenceDigest:null}]}),
  ])expect(await authorizeChessDocumentService(tx,opts)).toBeNull();
 });
 it("denies document mutations to a read-only service grantee",async()=>{
  expect(await authorizeChessDocumentService(fakeTx(),
   {...opts,requireWrite:true})).toBeNull();
 });
});
