import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {updateChessDocumentLifecycle} from "./document-lifecycle";
import {reconcileChessUnknownDocumentDisposal} from "./document-purge-reconcile";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {authorizeChessDocumentService} from "./document-service-authorization";
import {chessDemoModeActive} from "./demo-mode";
import * as s3 from "@/lib/storage/s3";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("./document-service-authorization",()=>({
 authorizeChessDocumentService:vi.fn(),
}));
vi.mock("./demo-mode",()=>({chessDemoModeActive:vi.fn(()=>false)}));
vi.mock("@/lib/storage/s3",()=>({
 isConfigured:vi.fn(()=>true),
 isPinnedObjectVersionAbsent:vi.fn(async()=>false),
 inventoryPinnedStorageVersions:vi.fn(async()=>"AMBIGUOUS"),
}));

const membership=vi.mocked(getCurrentMembership);
const dbRef=vi.mocked(getTenantDb);
const grant=vi.mocked(authorizeChessDocumentService);
const demo=vi.mocked(chessDemoModeActive);
const absent=vi.mocked(s3.isPinnedObjectVersionAbsent);
const inventory=vi.mocked(s3.inventoryPinnedStorageVersions);
const scope={businessId:"business-test",clientProfileId:"client-test",
 service:"BOOKKEEPING" as const,documentId:"document-test"};
const expired=new Date("2026-01-02T00:00:00Z");
function setup(status="REQUESTED",reviewer="independent-owner"){
 const document={
  id:scope.documentId,businessId:scope.businessId,
  clientProfileId:scope.clientProfileId,service:scope.service,
  status:"READY",createdAt:new Date("2025-01-01"),
  uploadedByClerkUserId:"uploader",revisionKind:"ORIGINAL",
  replacesDocumentId:null,checksumSha256:"f".repeat(64),
  verifiedAt:new Date("2025-04-01"),retentionUntil:expired as Date|null,
  legalHoldAt:null as Date|null,supersededAt:null,suppressedAt:null,purgedAt:null,
  storageKey:"tenants/tenant-test/2026/11/unique.pdf",
  storageVersionId:"exact-version-v1",
 };
 const disposal={
  id:"disposal-test",documentId:scope.documentId,
  businessId:scope.businessId,status,approvedAt:new Date("2026-10-01"),
  requestedByClerkUserId:"requester-a",approvedByClerkUserId:"approver-b",
  document,
 };
 const tx={
  membership:{findUnique:vi.fn(async()=>({status:"ACTIVE",role:"OWNER"}))},
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:"ACTIVE"}))},
  chessClientDocument:{
   findFirst:vi.fn(async()=>document),
   updateMany:vi.fn(async()=>({count:1})),
  },
  chessDocumentDisposal:{
   findUnique:vi.fn(async()=>disposal),
   findFirst:vi.fn(async()=>disposal),
   create:vi.fn(async()=>({id:"new-disposal"})),
   updateMany:vi.fn(async()=>({count:1})),
  },
  chessSecurityEvent:{create:vi.fn(async()=>({id:"immutable-event"}))},
 };
 const db={
  chessDocumentDisposal:{findFirst:vi.fn(async()=>disposal)},
  $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn(tx)),
 };
 dbRef.mockReturnValue({tenantId:"tenant-test",db} as never);
 membership.mockResolvedValue({clerkUserId:reviewer,status:"ACTIVE",
  role:"OWNER",email:null,displayName:null});
 grant.mockResolvedValue({canWrite:true});
 demo.mockReturnValue(false);
 return {document,disposal,tx,db};
}
beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubEnv("CHESS_DOCUMENT_LIFECYCLE_ENABLED","true");
 vi.stubEnv("CHESS_DOCUMENT_RETENTION_POLICY_APPROVED","true");
 vi.stubEnv("CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED","true");
 vi.stubEnv("CHESS_DOCUMENT_PURGE_STORAGE_APPROVED","true");
 vi.stubEnv("CHESS_DEMO_MODE","false");
 absent.mockResolvedValue(false);
 inventory.mockResolvedValue("AMBIGUOUS");
});
afterEach(()=>vi.unstubAllEnvs());
describe("Round 45 independently approved disposal and UNKNOWN audit",()=>{
 it("denies self-approval, legal hold, unset or unexpired retention",async()=>{
  const {document,disposal,tx}=setup();
  membership.mockResolvedValueOnce({clerkUserId:disposal.requestedByClerkUserId,
   role:"OWNER",status:"ACTIVE",email:null,displayName:null});
  const request={...scope,action:"APPROVE_DELETE"};
  await expect(updateChessDocumentLifecycle(request)).rejects.toThrow();
  document.legalHoldAt=new Date();
  await expect(updateChessDocumentLifecycle(request)).rejects.toThrow();
  document.legalHoldAt=null;
  document.retentionUntil=null;
  await expect(updateChessDocumentLifecycle(request)).rejects.toThrow();
  document.retentionUntil=new Date("2030-01-01");
  await expect(updateChessDocumentLifecycle(request)).rejects.toThrow();
  expect(tx.chessDocumentDisposal.updateMany).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("independent, expired and currently authorized approval is audited atomically",async()=>{
  const {tx,db}=setup();
  const result=await updateChessDocumentLifecycle({...scope,action:"APPROVE_DELETE"});
  expect(result).toMatchObject({updated:true,action:"APPROVE_DELETE"});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(tx.chessDocumentDisposal.updateMany).toHaveBeenCalledWith({
   where:expect.objectContaining({status:"REQUESTED"}),
   data:expect.objectContaining({status:"APPROVED",
    approvedByClerkUserId:"independent-owner"}),
  });
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:
   expect.objectContaining({action:"DOCUMENT_DISPOSAL_APPROVED",
    actorClerkUserId:"independent-owner",decision:"REVIEW"})});
 });
 it("refuses to resolve UNKNOWN when the pinned version exists or inventory is ambiguous",async()=>{
  const {db}=setup("UNKNOWN","third-person-resolver");
  absent.mockResolvedValueOnce(false);
  const first=await reconcileChessUnknownDocumentDisposal({
   businessId:scope.businessId,disposalId:"disposal-test",
  });
  expect(first).toMatchObject({status:"UNKNOWN",automaticallyRetried:false});
  absent.mockResolvedValueOnce(true);
  inventory.mockResolvedValueOnce("AMBIGUOUS");
  const second=await reconcileChessUnknownDocumentDisposal({
   businessId:scope.businessId,disposalId:"disposal-test",
  });
  expect(second).toMatchObject({status:"UNKNOWN",automaticallyRetried:false});
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it("requires three distinct actors and exact-version 404 plus no remaining versions before tombstone",async()=>{
  const {tx,disposal}=setup("UNKNOWN","third-person-resolver");
  absent.mockResolvedValue(true);
  inventory.mockResolvedValue("NO_CONTENT_VERSIONS");
  const resolved=await reconcileChessUnknownDocumentDisposal({
   businessId:scope.businessId,disposalId:"disposal-test",
  });
  expect(resolved).toEqual({status:"PURGED",versionAbsent:true,
   automaticallyRetried:false});
  expect(tx.chessDocumentDisposal.updateMany).toHaveBeenCalledWith({
   where:expect.objectContaining({status:"UNKNOWN"}),
   data:expect.objectContaining({status:"PURGED",receiptDigest:expect.any(String)}),
  });
  expect(tx.chessClientDocument.updateMany).toHaveBeenCalledWith({
   where:expect.objectContaining({legalHoldAt:null,storageVersionId:"exact-version-v1"}),
   data:{purgedAt:expect.any(Date)},
  });
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:
   expect.objectContaining({action:"DOCUMENT_UNKNOWN_VERSION_ABSENCE_CONFIRMED",
    actorClerkUserId:"third-person-resolver"})});
  membership.mockResolvedValueOnce({clerkUserId:disposal.approvedByClerkUserId,
   role:"OWNER",status:"ACTIVE",email:null,displayName:null});
  await expect(reconcileChessUnknownDocumentDisposal({
   businessId:scope.businessId,disposalId:"disposal-test",
  })).rejects.toThrow();
 });
});
