import {describe,expect,it} from "vitest";
import {matchesPinnedDocument} from "./storage-integrity";
describe("sensitive document S3 version pinning",()=>{
 const doc={storageVersionId:"version-123",storageETag:"etag-abc",actualBytes:16,mimeType:"application/pdf",maxBytes:1024};
 const head={versionId:"version-123",etag:"etag-abc",size:16,mimeType:"application/pdf"};
 it("accepts the exact pinned version",()=>{
  expect(matchesPinnedDocument(doc,head)).toBe(true);
 });
 it("denies unversioned storage and replaced content",()=>{
  expect(matchesPinnedDocument({...doc,storageVersionId:null},head)).toBe(false);
  expect(matchesPinnedDocument({...doc,storageVersionId:"null"},{...head,versionId:"null"})).toBe(false);
  expect(matchesPinnedDocument(doc,{...head,versionId:"version-456"})).toBe(false);
  expect(matchesPinnedDocument(doc,{...head,etag:"different"})).toBe(false);
  expect(matchesPinnedDocument(doc,{...head,size:17})).toBe(false);
 });
 it("rejects missing, empty, wrong-type or oversized objects",()=>{
  expect(matchesPinnedDocument(doc,null)).toBe(false);
  expect(matchesPinnedDocument(doc,{...head,size:0})).toBe(false);
  expect(matchesPinnedDocument(doc,{...head,mimeType:"image/jpeg"})).toBe(false);
  expect(matchesPinnedDocument({...doc,maxBytes:8},head)).toBe(false);
 });
});
