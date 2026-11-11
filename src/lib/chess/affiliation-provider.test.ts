import {afterEach,describe,expect,it,vi} from "vitest";
import {affiliationProviderConfigured,validAffiliationEvidence,
 verifyAffiliationWithProvider} from "./affiliation-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const expected={practitionerRegistryId:"NMLS-EXAMPLE",
 firmRegistryId:"FIRM-EXAMPLE",service:"MORTGAGE",jurisdiction:"CA"};
const proof={...expected,status:"ACTIVE",checkedAt:"2026-11-10T19:00:00.000Z",
 expiresAt:"2099-01-01T00:00:00.000Z",
 sourceUrl:"https://official.test.gov/registry/firm"};
describe("M6 independently sourced firm affiliations",()=>{
 it("rejects unapproved sources, inactive records and mismatched firms",()=>{
  vi.stubEnv("CHESS_AFFILIATION_SOURCE_HOSTS","official.test.gov");
  const now=new Date("2026-11-10T20:00:00.000Z");
  expect(validAffiliationEvidence(proof,expected,now)).not.toBeNull();
  expect(validAffiliationEvidence({...proof,firmRegistryId:"OTHER"},expected,now)).toBeNull();
  expect(validAffiliationEvidence({...proof,status:"SUSPENDED"},expected,now)).toBeNull();
  expect(validAffiliationEvidence({...proof,sourceUrl:"https://evil.invalid"},expected,now)).toBeNull();
  expect(validAffiliationEvidence({...proof,checkedAt:"2026-11-01T00:00:00.000Z"},expected,now)).toBeNull();
 });
 it("requires an explicit enable flag and approved HTTPS host",()=>{
  vi.stubEnv("CHESS_AFFILIATION_VERIFICATION_ENABLED","false");
  vi.stubEnv("CHESS_AFFILIATION_API_URL","https://registry.test.example/verify");
  vi.stubEnv("CHESS_AFFILIATION_ALLOWED_HOST","registry.test.example");
  vi.stubEnv("CHESS_AFFILIATION_API_KEY","sandbox-key");
  expect(affiliationProviderConfigured()).toBe(false);
  vi.stubEnv("CHESS_AFFILIATION_VERIFICATION_ENABLED","true");
  expect(affiliationProviderConfigured()).toBe(true);
  vi.stubEnv("CHESS_AFFILIATION_API_URL","https://evil.invalid/verify");
  expect(affiliationProviderConfigured()).toBe(false);
 });
 it("sends only public registry IDs to approved registry gateway",async()=>{
  vi.stubEnv("CHESS_AFFILIATION_VERIFICATION_ENABLED","true");
  vi.stubEnv("CHESS_AFFILIATION_API_URL","https://registry.test.example/verify");
  vi.stubEnv("CHESS_AFFILIATION_ALLOWED_HOST","registry.test.example");
  vi.stubEnv("CHESS_AFFILIATION_API_KEY","sandbox-key");
  vi.stubEnv("CHESS_AFFILIATION_SOURCE_HOSTS","official.test.gov");
  const now=new Date();
  const response={...proof,checkedAt:now.toISOString()};
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>response});
  vi.stubGlobal("fetch",http);
  const result=await verifyAffiliationWithProvider(expected);
  expect(result?.status).toBe("ACTIVE");
  const [url,options]=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://registry.test.example/verify");
  expect(JSON.parse(String(options.body))).toEqual(expected);
  expect(options.redirect).toBe("error");
 });
});
