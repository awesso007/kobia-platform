import {describe,expect,it} from "vitest";
import {documentDownloadAllowed} from "./documents";
import {documentLifecycleEnabled} from "./document-lifecycle";

describe("M3 restricted document lifecycle",()=>{
 const ready={status:"READY",storageVersionId:"version-01",
  storageETag:"etag",suppressedAt:null,retentionUntil:null};
 it("only signs READY unsuppressed and unexpired pinned documents",()=>{
  expect(documentDownloadAllowed(ready)).toBe(true);
  expect(documentDownloadAllowed({...ready,status:"QUARANTINED"})).toBe(false);
  expect(documentDownloadAllowed({...ready,suppressedAt:new Date()})).toBe(false);
  expect(documentDownloadAllowed({...ready,retentionUntil:new Date("2020-01-01")})).toBe(false);
  expect(documentDownloadAllowed({...ready,storageVersionId:null})).toBe(false);
  expect(documentDownloadAllowed(null)).toBe(false);
 });
 it("defaults off until policy and operation flags are independently present",()=>{
  expect(documentLifecycleEnabled({} as NodeJS.ProcessEnv)).toBe(false);
  expect(documentLifecycleEnabled({CHESS_DOCUMENT_LIFECYCLE_ENABLED:"true"} as NodeJS.ProcessEnv)).toBe(false);
  expect(documentLifecycleEnabled({CHESS_DOCUMENT_LIFECYCLE_ENABLED:"true",
   CHESS_DOCUMENT_RETENTION_POLICY_APPROVED:"true"} as NodeJS.ProcessEnv)).toBe(true);
 });
});
