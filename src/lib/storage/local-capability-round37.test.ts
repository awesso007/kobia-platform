import {afterEach,describe,it,expect} from "vitest";
import {signedLocalDownloadUrl,verifyLocalDownloadCapability} from "./local-capability";
const KEY="test-only-32-byte-randomized-local-signing-key-0123456789";
afterEach(()=>{delete process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY;});
describe("Round 37 local file short-lived bearer links",()=>{
 it("rejects unsigned, forged, cross-file and expired access",()=>{
  process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY=KEY;
  const now=Date.UTC(2026,10,12,10,0,0);
  const url=signedLocalDownloadUrl("tenants/example/2026/file.bin",60,now);
  const params=new URL(url,"https://dev.example").searchParams;
  const exp=params.get("exp"),sig=params.get("sig");
  expect(verifyLocalDownloadCapability("tenants/example/2026/file.bin",exp,sig,now)).toBe(true);
  expect(verifyLocalDownloadCapability("tenants/other/2026/file.bin",exp,sig,now)).toBe(false);
  expect(verifyLocalDownloadCapability("tenants/example/2026/file.bin",exp,sig,now+61000)).toBe(false);
  expect(verifyLocalDownloadCapability("tenants/example/2026/file.bin",exp,"0".repeat(64),now)).toBe(false);
  expect(verifyLocalDownloadCapability("tenants/example/2026/file.bin",null,null,now)).toBe(false);
 });
 it("defaults closed without a managed, strong signing key",()=>{
  delete process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY;
  expect(()=>signedLocalDownloadUrl("tenants/example/file")).toThrow("signing key unavailable");
  expect(verifyLocalDownloadCapability("tenants/example/file","1794506400","0".repeat(64))).toBe(false);
  process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY="short";
  expect(()=>signedLocalDownloadUrl("tenants/example/file")).toThrow("signing key unavailable");
 });
 it("caps an excessively long requested public link to one minute",()=>{
  process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY=KEY;
  const now=Date.UTC(2026,10,12,10,0,0);
  const link=signedLocalDownloadUrl("tenants/example/file",3600,now);
  const exp=Number(new URL(link,"http://localhost").searchParams.get("exp"));
  expect(exp).toBe(Math.floor(now/1000)+60);
 });
});
