import {afterEach,describe,expect,it,vi} from "vitest";
import {isAuthoritativeRegistryResponse,licenseRegistryConfigured} from "./license-registry";
afterEach(()=>vi.unstubAllEnvs());
describe("independent registry verification",()=>{
 it("requires the configured approved registry host",()=>{
  vi.stubEnv("CHESS_LICENSE_API_URL","http://registry.example.com/verify");
  vi.stubEnv("CHESS_LICENSE_ALLOWED_HOST","registry.example.com");
  vi.stubEnv("CHESS_LICENSE_API_KEY","secret");
  expect(licenseRegistryConfigured()).toBe(false);
  vi.stubEnv("CHESS_LICENSE_API_URL","https://registry.example.com/verify");
  expect(licenseRegistryConfigured()).toBe(true);
 });
 it("refuses stale, revoked and incorrect licenses",()=>{
  vi.stubEnv("CHESS_LICENSE_SOURCE_HOSTS","official.example.gov");
  const expected={registryId:"TEST123",service:"MORTGAGE",jurisdiction:"CA"};
  const record={...expected,status:"ACTIVE",expiresAt:"2099-01-01T00:00:00.000Z",
   sourceUrl:"https://official.example.gov/license/TEST123",
   checkedAt:"2026-11-10T18:00:00.000Z"};
  const now=new Date("2026-11-10T18:30:00.000Z");
  expect(isAuthoritativeRegistryResponse(record,expected,now)).toBe(true);
  expect(isAuthoritativeRegistryResponse({...record,status:"SUSPENDED"},expected,now)).toBe(false);
  expect(isAuthoritativeRegistryResponse({...record,sourceUrl:"https://fake.example.com/license/TEST123"},expected,now)).toBe(false);
  expect(isAuthoritativeRegistryResponse({...record,checkedAt:"2026-11-01T00:00:00.000Z"},expected,now)).toBe(false);
  expect(isAuthoritativeRegistryResponse({...record,registryId:"DIFFERENT"},expected,now)).toBe(false);
 });
});
