import {describe,expect,it} from "vitest";
import {mayReadStagingAttestation,validReleaseSha}
 from "./staging-attestation";
const sha="a".repeat(40),token="x".repeat(40);
const config={enabled:"true",token,releaseSha:sha};
describe("M8 staging build identity guard",()=>{
 it("allows only a separately configured protected token",()=>{
  expect(mayReadStagingAttestation("Bearer "+token,config)).toBe(true);
  expect(mayReadStagingAttestation(null,config)).toBe(false);
  expect(mayReadStagingAttestation("Bearer "+"y".repeat(40),config)).toBe(false);
  expect(mayReadStagingAttestation("Basic "+token,config)).toBe(false);
  expect(mayReadStagingAttestation("Bearer "+token,{
   ...config,enabled:"false",
  })).toBe(false);
  expect(mayReadStagingAttestation("Bearer "+token,{
   ...config,token:"short",
  })).toBe(false);
 });
 it("rejects empty, partial and invalid release metadata",()=>{
  expect(validReleaseSha(sha)).toBe(true);
  expect(validReleaseSha("a".repeat(39))).toBe(false);
  expect(validReleaseSha("g".repeat(40))).toBe(false);
  expect(mayReadStagingAttestation("Bearer "+token,{
   ...config,releaseSha:"pending",
  })).toBe(false);
 });
});
