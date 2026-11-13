import {createHmac} from "node:crypto";
import {afterEach,describe,expect,it,vi} from "vitest";
import {verifyScanSignature} from "./document-scanning";
afterEach(()=>vi.unstubAllEnvs());
describe("signed malware scan response",()=>{
 it("rejects missing scanner key",()=>{
  vi.stubEnv("CHESS_DOCUMENT_SCAN_KEY","");
  expect(verifyScanSignature("{}","1700000000000","0".repeat(64),"acme",1700000000000)).toBe(false);
 });
 it("requires matching payload, tenant, and recent timestamp",()=>{
  const key="a".repeat(64);
  vi.stubEnv("CHESS_DOCUMENT_SCAN_KEY",key);
  const payload='{"documentId":"doc-1","result":"CLEAN"}';
  const timestamp="1700000000000";
  const signature=createHmac("sha256",key).update("acme."+timestamp+"."+payload).digest("hex");
  expect(verifyScanSignature(payload,timestamp,signature,"acme",1700000000000)).toBe(true);
  expect(verifyScanSignature(payload,timestamp,signature,"another",1700000000000)).toBe(false);
  expect(verifyScanSignature(payload+" ",timestamp,signature,"acme",1700000000000)).toBe(false);
  expect(verifyScanSignature(payload,timestamp,signature,"acme",1700000600000)).toBe(false);
 });
});
