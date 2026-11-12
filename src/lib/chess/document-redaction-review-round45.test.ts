import {createHash} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {streamChessRedactionReview} from "./documents";
import {updateChessDocumentLifecycle} from "./document-lifecycle";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import * as s3 from "@/lib/storage/s3";
import {authorizeChessDocumentService} from "./document-service-authorization";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/storage/s3",()=>({
 headObject:vi.fn(),getObjectBody:vi.fn(),isConfigured:vi.fn(),
 inventoryPinnedStorageVersions:vi.fn(),
}));
vi.mock("./document-service-authorization",()=>({
 authorizeChessDocumentService:vi.fn(),
}));
vi.mock("./sensitive-read-audit",()=>({
 auditedChessSensitiveRead:vi.fn(),
}));

const actor=vi.mocked(getCurrentMembership);
const dbRef=vi.mocked(getTenantDb);
const grant=vi.mocked(authorizeChessDocumentService);
const audit=vi.mocked(auditedChessSensitiveRead);
const head=vi.mocked(s3.headObject);
const body=vi.mocked(s3.getObjectBody);
const inventory=vi.mocked(s3.inventoryPinnedStorageVersions);
const bytes=Buffer.from("FICTIONAL REVIEWABLE REDACTION");
const sha=createHash("sha256").update(bytes).digest("hex");
const date=new Date("2026-11-12T12:00:00Z");
const params={documentId:"doc-1",businessId:"unit-1",
 clientProfileId:"client-1",service:"BOOKKEEPING" as const};
function ready(){
 return {
  id:"doc-1",businessId:params.businessId,
  clientProfileId:params.clientProfileId,service:params.service,
  status:"QUARANTINED",revisionKind:"REDACTED",replacesDocumentId:"parent",
  uploadedByClerkUserId:"fictional-creator",verifiedAt:date,
  checksumSha256:sha,storageKey:"tenants/chess/2026/11/redacted.pdf",
  storageVersionId:"pinned-v1",storageETag:"etag-1",
  actualBytes:bytes.length,maxBytes:1024,mimeType:"application/pdf",
  fileName:"redacted.pdf",retentionUntil:null,suppressedAt:null,
  supersededAt:null,purgedAt:null,legalHoldAt:null,createdAt:new Date("2026-11-01"),
 };
}
function setup(reviewed=true){
 const doc=ready();
 const tx={
  membership:{findUnique:vi.fn(async()=>({status:"ACTIVE",role:"OWNER"}))},
  chessClientDocument:{
   findFirst:vi.fn(async()=>doc),
   updateMany:vi.fn(async()=>({count:1})),
  },
  chessSecurityEvent:{
   findFirst:vi.fn(async()=>reviewed?{id:"review-evidence"}:null),
   create:vi.fn(async()=>({id:"event-new"})),
  },
 };
 const db={
  chessClientDocument:{findFirst:vi.fn(async()=>doc)},
  $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn(tx)),
 };
 dbRef.mockReturnValue({db,tenantId:"chess"} as never);
 actor.mockResolvedValue({clerkUserId:"fictional-reviewer",status:"ACTIVE",
  role:"OWNER",email:null,displayName:null});
 grant.mockResolvedValue({canWrite:true});
 inventory.mockResolvedValue("ONLY_PINNED");
 head.mockResolvedValue({versionId:"pinned-v1",etag:"etag-1",
  size:bytes.length,mimeType:"application/pdf"});
 body.mockResolvedValue({transformToByteArray:vi.fn(async()=>bytes)} as never);
 audit.mockImplementation(async(_db,_ctx,fn)=>{
  const val=await fn(tx as never);
  if(val===null)throw new PermissionError("record:read" as never);
  return val;
 });
 return {doc,tx,db};
}
beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubEnv("CHESS_DOCUMENT_LIFECYCLE_ENABLED","true");
 vi.stubEnv("CHESS_DOCUMENT_RETENTION_POLICY_APPROVED","true");
});
describe("Round 45 independent redaction review",()=>{
 it("refuses uploader self-review before loading private content",async()=>{
  const {doc}=setup();
  actor.mockResolvedValue({clerkUserId:doc.uploadedByClerkUserId,
   status:"ACTIVE",role:"OWNER",email:null,displayName:null});
  await expect(streamChessRedactionReview(...Object.values(params) as
   [string,string,string,"BOOKKEEPING"])).rejects.toThrow();
  expect(body).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
 });
 it("blocks review of ambiguous S3 version history before an audit is recorded",async()=>{
  setup();
  inventory.mockResolvedValueOnce("AMBIGUOUS");
  await expect(streamChessRedactionReview("doc-1","unit-1","client-1",
   "BOOKKEEPING")).rejects.toThrow();
  expect(body).not.toHaveBeenCalled();
  expect(audit).not.toHaveBeenCalled();
 });
 it("denies tampered scanned content before recording reviewer-read evidence",async()=>{
  setup();
  body.mockResolvedValueOnce({
   transformToByteArray:async()=>Buffer.from("MISMATCHED PRIVATE BYTES"),
  } as never);
  await expect(streamChessRedactionReview("doc-1","unit-1","client-1",
   "BOOKKEEPING")).rejects.toThrow();
  expect(audit).not.toHaveBeenCalled();
 });
 it("rechecks live grant and commits audit before releasing verified bytes",async()=>{
  setup();
  const opened=await streamChessRedactionReview("doc-1","unit-1","client-1",
   "BOOKKEEPING");
  expect(opened.actualBytes).toBe(bytes.length);
  expect(Buffer.from(await new Response(opened.stream).arrayBuffer()).equals(bytes)).toBe(true);
  expect(audit).toHaveBeenCalledWith(expect.anything(),
   expect.objectContaining({action:"DOCUMENT_REDACTION_REVIEW_CONTENT_READ",
    actorClerkUserId:"fictional-reviewer",resourceId:"doc-1"}),
   expect.any(Function));
 });
 it("requires explicit independent attestation and a matching post-scan read event",async()=>{
  const {tx}=setup(false);
  const approval={...params,action:"REDACTION_APPROVE",reviewedContent:true};
  await expect(updateChessDocumentLifecycle({
   ...params,action:"REDACTION_APPROVE",
  })).rejects.toThrow();
  await expect(updateChessDocumentLifecycle(approval)).rejects.toThrow();
  expect(tx.chessClientDocument.updateMany).not.toHaveBeenCalled();
  tx.chessSecurityEvent.findFirst.mockResolvedValue({id:"review-evidence"});
  const approved=await updateChessDocumentLifecycle(approval);
  expect(approved).toMatchObject({updated:true,action:"REDACTION_APPROVE"});
  expect(tx.chessSecurityEvent.findFirst).toHaveBeenCalledWith({
   where:expect.objectContaining({
    actorClerkUserId:"fictional-reviewer",
    action:"DOCUMENT_REDACTION_REVIEW_CONTENT_READ",
    occurredAt:{gte:date},
   }),select:{id:true},
  });
  expect(tx.chessClientDocument.updateMany).toHaveBeenCalledTimes(2);
 });
});
