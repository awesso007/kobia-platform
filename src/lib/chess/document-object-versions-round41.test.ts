import {describe,expect,it} from "vitest";
import {pinnedStorageVersionInventory} from "@/lib/storage/s3";
import {readFileSync} from "node:fs";

describe("Round 41 exact-version S3 erasure must account for every stored version",()=>{
 const key="tenants/fictional-corp/2026/11/unique.pdf";
 it("permits only a uniquely pinned version before a delete",()=>{
  expect(pinnedStorageVersionInventory([{Key:key,VersionId:"v1"}],key,"v1",false))
   .toBe("ONLY_PINNED");
  expect(pinnedStorageVersionInventory([{Key:key,VersionId:"v1"},
   {Key:key,VersionId:"v2"}],key,"v1",false)).toBe("AMBIGUOUS");
  expect(pinnedStorageVersionInventory([{Key:key,VersionId:"unexpected"}],
   key,"v1",false)).toBe("AMBIGUOUS");
 });
 it("refuses a truncated or invalid version inventory",()=>{
  expect(pinnedStorageVersionInventory([{Key:key,VersionId:"v1"}],
   key,"v1",true)).toBe("AMBIGUOUS");
  expect(pinnedStorageVersionInventory([{VersionId:"v1"}],
   key,"v1")).toBe("AMBIGUOUS");
  expect(pinnedStorageVersionInventory([],key,"null")).toBe("AMBIGUOUS");
  expect(pinnedStorageVersionInventory([],key.replace("tenants/",""),
   "v1")).toBe("AMBIGUOUS");
 });
 it("allows a no-content-version verdict only after an exhaustive listing",()=>{
  expect(pinnedStorageVersionInventory([],key,"v1",false))
   .toBe("NO_CONTENT_VERSIONS");
  expect(pinnedStorageVersionInventory([{Key:key+"-different",VersionId:"v2"}],
   key,"v1",false)).toBe("NO_CONTENT_VERSIONS");
  expect(pinnedStorageVersionInventory([],key,"v1",true)).toBe("AMBIGUOUS");
 });
 it("workers inspect version inventories and cannot purge in demo mode",()=>{
  const worker=readFileSync("src/lib/chess/document-purge.ts","utf8");
  const reviewer=readFileSync("src/lib/chess/document-purge-reconcile.ts","utf8");
  expect(worker).toContain("CHESS_DEMO_MODE");
  expect(worker).toContain('before!=="ONLY_PINNED"');
  expect(worker).toContain('after!=="NO_CONTENT_VERSIONS"');
  expect(reviewer).toContain('inventory!=="NO_CONTENT_VERSIONS"');
  expect(reviewer).not.toMatch(/await\s+s3\.deletePinnedObjectVersion\s*\(/);
 });
});
