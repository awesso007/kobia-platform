import {beforeEach,describe,expect,it,vi} from "vitest";
import {confirmChessDocumentUpload} from "./documents";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {authorizeChessDocumentService} from "./document-service-authorization";
import * as s3 from "@/lib/storage/s3";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error{},
}));
vi.mock("./document-service-authorization",()=>({
 authorizeChessDocumentService:vi.fn(),
}));
vi.mock("@/lib/storage/s3",()=>({
 headObjectStrict:vi.fn(),inventoryPinnedStorageVersions:vi.fn(),
}));

const current=vi.mocked(getCurrentMembership);
const dbContext=vi.mocked(getTenantDb);
const grant=vi.mocked(authorizeChessDocumentService);
const head=vi.mocked(s3.headObjectStrict);
const versions=vi.mocked(s3.inventoryPinnedStorageVersions);
const fixture={
 id:"doc-test",businessId:"unit-test",clientProfileId:"client-test",
 service:"BOOKKEEPING" as const,status:"PENDING",
 storageKey:"tenants/tenant-test/2026/11/doc.pdf",maxBytes:2000,
 mimeType:"application/pdf",storageVersionId:null,storageETag:null,
 uploadedByClerkUserId:"creator-test",
};
function setup(){
 const tx={
  membership:{findUnique:vi.fn(async()=>({status:"ACTIVE",role:"MEMBER"}))},
  chessClientDocument:{findFirst:vi.fn(async()=>fixture),
   updateMany:vi.fn(async()=>({count:1}))},
  chessSecurityEvent:{create:vi.fn(async()=>({id:"audit-1"}))},
 };
 const db={chessClientDocument:{findFirst:vi.fn(async()=>fixture)},
  $transaction:vi.fn(async(fn:(tx:unknown)=>Promise<unknown>)=>fn(tx))};
 dbContext.mockReturnValue({tenantId:"tenant-test",db} as never);
 current.mockResolvedValue({clerkUserId:"creator-test",status:"ACTIVE",
  role:"MEMBER",email:null,displayName:null});
 grant.mockResolvedValue({canWrite:true});
 head.mockResolvedValue({versionId:"pinned-v1",etag:"opaque-etag",
  size:1024,mimeType:"application/pdf"});
 versions.mockResolvedValue("ONLY_PINNED");
 return {tx,db};
}
beforeEach(()=>vi.clearAllMocks());
describe("Round 45 upload confirmation is source-version and audit bound",()=>{
 it("accepts a single pinned version with live authorization and audit in one transaction",async()=>{
  const {tx,db}=setup();
  expect(await confirmChessDocumentUpload("doc-test","unit-test","client-test","BOOKKEEPING"))
    .toEqual({status:"QUARANTINED"});
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(versions).toHaveBeenCalledWith(fixture.storageKey,"pinned-v1");
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:{
   businessId:"unit-test",actorClerkUserId:"creator-test",
   action:"DOCUMENT_UPLOAD_PINNED_QUARANTINED",
   resourceType:"ChessClientDocument",resourceId:"doc-test",decision:"REVIEW",
  }});
  expect(JSON.stringify(tx.chessSecurityEvent.create.mock.calls))
   .not.toContain(fixture.storageKey);
 });
 it("does not transition or create a false negative audit on storage timeout or missing upload",async()=>{
  const {tx}=setup();
  head.mockRejectedValueOnce(new Error("SYNTHETIC_STORAGE_TIMEOUT"));
  await expect(confirmChessDocumentUpload("doc-test","unit-test","client-test","BOOKKEEPING"))
   .rejects.toThrow("SYNTHETIC_STORAGE_TIMEOUT");
  head.mockResolvedValueOnce(null);
  await expect(confirmChessDocumentUpload("doc-test","unit-test","client-test","BOOKKEEPING"))
   .rejects.toThrow("not yet verified");
  expect(tx.chessClientDocument.updateMany).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects ambiguous multi-version storage with a durable denial event",async()=>{
  const {tx}=setup();
  versions.mockResolvedValueOnce("AMBIGUOUS");
  const result=await confirmChessDocumentUpload(
   "doc-test","unit-test","client-test","BOOKKEEPING");
  expect(result.status).toBe("REJECTED");
  expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({data:
   expect.objectContaining({action:"DOCUMENT_UPLOAD_METADATA_REJECTED",
    decision:"DENY"})});
  expect(tx.chessClientDocument.updateMany).toHaveBeenCalledWith(expect.objectContaining({
   data:{status:"REJECTED"},
  }));
 });
 it("fails closed when membership or service write grant is revoked before recording audit",async()=>{
  const {tx}=setup();
  grant.mockResolvedValueOnce(null);
  await expect(confirmChessDocumentUpload(
   "doc-test","unit-test","client-test","BOOKKEEPING")).rejects.toThrow();
  expect(tx.chessClientDocument.updateMany).not.toHaveBeenCalled();
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
 });
 it("rejects a foreign tenant storage key before pinning any response",async()=>{
  const {db}=setup();
  db.chessClientDocument.findFirst.mockResolvedValue({
   ...fixture,storageKey:"tenants/another-tenant/doc.pdf",
  });
  await expect(confirmChessDocumentUpload(
   "doc-test","unit-test","client-test","BOOKKEEPING")).rejects.toThrow();
  expect(head).not.toHaveBeenCalled();
 });
});
