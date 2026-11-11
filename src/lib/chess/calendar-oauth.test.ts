import {afterEach,describe,expect,it,vi} from "vitest";
import {delegatedCalendarOAuthConfigured,validateCalendarOAuthStatus}
 from "./calendar-oauth";
afterEach(()=>vi.unstubAllEnvs());
describe("M4 delegated employee OAuth gateway contract",()=>{
 const cfg=()=>{
  vi.stubEnv("CHESS_CALENDAR_OAUTH_ENABLED","true");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED","true");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_API_KEY","sandbox-only");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_ALLOWED_HOST","calendar.gateway.test");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_START_URL","https://calendar.gateway.test/connect");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_STATUS_URL","https://calendar.gateway.test/status");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_REVOKE_URL","https://calendar.gateway.test/revoke");
 };
 it("requires both approval and all three pinned HTTPS endpoints",()=>{
  cfg();
  expect(delegatedCalendarOAuthConfigured()).toBe(true);
  vi.stubEnv("CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED","false");
  expect(delegatedCalendarOAuthConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED","true");
  vi.stubEnv("CHESS_CALENDAR_OAUTH_REVOKE_URL","http://calendar.gateway.test/revoke");
  expect(delegatedCalendarOAuthConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_OAUTH_REVOKE_URL","https://evil.test/revoke");
  expect(delegatedCalendarOAuthConfigured()).toBe(false);
 });
 it("requires fresh matching employee and tenant with task scope",()=>{
  const current=new Date("2026-11-11T16:00:00.000Z");
  const row={tenantSlug:"tenant-a",clerkUserId:"staff-a",
   state:"CONNECTED",scopes:["TASKS"],checkedAt:"2026-11-11T15:59:00.000Z"};
  expect(validateCalendarOAuthStatus(row,{
   tenantSlug:"tenant-a",clerkUserId:"staff-a"},current).state).toBe("CONNECTED");
  expect(()=>validateCalendarOAuthStatus({...row,tenantSlug:"tenant-b"},{
   tenantSlug:"tenant-a",clerkUserId:"staff-a"},current)).toThrow();
  expect(()=>validateCalendarOAuthStatus({...row,checkedAt:"2026-11-11T15:00:00.000Z"},{
   tenantSlug:"tenant-a",clerkUserId:"staff-a"},current)).toThrow();
  expect(()=>validateCalendarOAuthStatus({...row,scopes:[]},{
   tenantSlug:"tenant-a",clerkUserId:"staff-a"},current)).toThrow();
 });
});
