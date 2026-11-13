import {describe,expect,it} from "vitest";
import {independentDisposalResolver} from "./document-purge-reconcile";

describe("Round 41 independently reviewed ambiguous document disposal",()=>{
 const base={requester:"fictional-requester",approver:"fictional-approver",
  resolver:"fictional-owner",status:"UNKNOWN",approvedAt:new Date("2026-11-01")};
 it("requires a third independent actor and a prior second-person approval",()=>{
  expect(independentDisposalResolver(base)).toBe(true);
  expect(independentDisposalResolver({...base,resolver:base.requester})).toBe(false);
  expect(independentDisposalResolver({...base,resolver:base.approver})).toBe(false);
  expect(independentDisposalResolver({...base,approver:null})).toBe(false);
  expect(independentDisposalResolver({...base,approvedAt:null})).toBe(false);
 });
 it("cannot resolve unfinished, already purged or rejected requests",()=>{
  for(const status of ["REQUESTED","APPROVED","EXECUTING","PURGED","REJECTED"])
   expect(independentDisposalResolver({...base,status})).toBe(false);
 });
 it("never imports a delete-capable function or retries a PUT/DELETE in reconciliation",async()=>{
  const {readFileSync}=await import("node:fs");
  const source=readFileSync("src/lib/chess/document-purge-reconcile.ts","utf8");
  expect(source).toContain("isPinnedObjectVersionAbsent");
  expect(source).not.toMatch(/await\s+s3\.deletePinnedObjectVersion\s*\(/);
  expect(source).toContain('status:"UNKNOWN"');
  expect(source).toContain('automaticallyRetried:false');
 });
});
