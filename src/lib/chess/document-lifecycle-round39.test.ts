import {afterEach,describe,expect,it,vi} from "vitest";
import {documentDownloadAllowed} from "./documents";
import {documentLifecycleEnabled,documentPurgeEnabled} from "./document-lifecycle";
import {eligibleForDocumentPurge,authorizedDocumentPurgeWorker} from "./document-purge";

afterEach(()=>vi.unstubAllEnvs());
const now=new Date("2026-11-12T20:00:00.000Z");
const ready={
 status:"READY",storageKey:"tenants/fictional/2026/11/versioned.pdf",
 storageVersionId:"s3-version",storageETag:"etag",
 suppressedAt:null,retentionUntil:new Date("2026-11-11T00:00:00.000Z"),
 supersededAt:null,purgedAt:null,legalHoldAt:null,
};
describe("Round 39 document lifecycle fail-closed policy",()=>{
 it("rejects download of superseded, purged, expired and suppressed revisions",()=>{
  expect(documentDownloadAllowed({...ready,retentionUntil:null},now)).toBe(true);
  expect(documentDownloadAllowed({...ready,retentionUntil:null,
   supersededAt:new Date("2026-11-10")},now)).toBe(false);
  expect(documentDownloadAllowed({...ready,retentionUntil:null,
   purgedAt:new Date("2026-11-10")},now)).toBe(false);
  expect(documentDownloadAllowed(ready,now)).toBe(false);
  expect(documentDownloadAllowed({...ready,retentionUntil:null,
   suppressedAt:new Date("2026-11-10")},now)).toBe(false);
 });
 it("blocks byte deletion without all four separate release decisions",()=>{
  const flags={
   CHESS_DOCUMENT_LIFECYCLE_ENABLED:"true",
   CHESS_DOCUMENT_RETENTION_POLICY_APPROVED:"true",
   CHESS_DOCUMENT_PURGE_EXECUTION_ENABLED:"true",
   CHESS_DOCUMENT_PURGE_STORAGE_APPROVED:"true",
  };
  expect(documentLifecycleEnabled(flags)).toBe(true);
  expect(documentPurgeEnabled(flags)).toBe(true);
  for(const name of Object.keys(flags)){
   expect(documentPurgeEnabled({...flags,[name]:"false"})).toBe(false);
  }
  expect(documentPurgeEnabled({})).toBe(false);
 });
 it("never purges before legal retention expiry or while hold remains",()=>{
  expect(eligibleForDocumentPurge(ready,now)).toBe(true);
  expect(eligibleForDocumentPurge({...ready,legalHoldAt:now},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,retentionUntil:null},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,retentionUntil:new Date("2030-01-01")},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,purgedAt:now},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,storageVersionId:null},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,storageVersionId:"null"},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,storageKey:"not-tenant-scoped"},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,status:"PENDING"},now)).toBe(false);
  expect(eligibleForDocumentPurge({...ready,status:"QUARANTINED"},now)).toBe(false);
 });
 it("requires strong, exact machine token; missing token always denies",()=>{
  vi.stubEnv("CHESS_DOCUMENT_PURGE_WORKER_TOKEN","");
  expect(authorizedDocumentPurgeWorker("")).toBe(false);
  expect(authorizedDocumentPurgeWorker("anything")).toBe(false);
  vi.stubEnv("CHESS_DOCUMENT_PURGE_WORKER_TOKEN","short");
  expect(authorizedDocumentPurgeWorker("short")).toBe(false);
  vi.stubEnv("CHESS_DOCUMENT_PURGE_WORKER_TOKEN","different-secret-for-tests-only-123456789");
  expect(authorizedDocumentPurgeWorker("different-secret-for-tests-only-123456789")).toBe(true);
  expect(authorizedDocumentPurgeWorker("different-secret-for-tests-only-123456780")).toBe(false);
 });
});
