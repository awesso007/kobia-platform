import {afterEach,describe,expect,it,vi} from "vitest";
import {calendarGatewayConfigured,lookupCalendarEvent} from "./calendar-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("outbound calendar gateway",()=>{
 it("does not send events without explicit enablement",()=>{
  vi.stubEnv("CHESS_CALENDAR_SYNC_ENABLED","false");
  expect(calendarGatewayConfigured()).toBe(false);
 });
 it("requires approved exact HTTPS host",()=>{
  vi.stubEnv("CHESS_CALENDAR_SYNC_ENABLED","true");
  vi.stubEnv("CHESS_CALENDAR_API_KEY","placeholder");
  vi.stubEnv("CHESS_CALENDAR_ALLOWED_HOST","calendar.example.com");
  vi.stubEnv("CHESS_CALENDAR_API_URL","http://calendar.example.com/v1/events");
  expect(calendarGatewayConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_API_URL","https://bad.example.com/v1/events");
  expect(calendarGatewayConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_API_URL","https://calendar.example.com/v1/events");
  expect(calendarGatewayConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_CANCEL_API_URL","https://calendar.example.com/v1/cancellations");
  expect(calendarGatewayConfigured()).toBe(false);
  vi.stubEnv("CHESS_CALENDAR_STATUS_API_URL","https://calendar.example.com/v1/status");
  expect(calendarGatewayConfigured()).toBe(true);
  vi.stubEnv("CHESS_CALENDAR_CANCEL_API_URL","https://attacker.example/v1/cancellations");
  expect(calendarGatewayConfigured()).toBe(false);
 });
});

describe("calendar status lookup sandbox contract",()=>{
 it("sends a private, host-pinned request and parses accepted event IDs",async()=>{
  vi.stubEnv("CHESS_CALENDAR_SYNC_ENABLED","true");
  vi.stubEnv("CHESS_CALENDAR_API_KEY","sandbox-placeholder");
  vi.stubEnv("CHESS_CALENDAR_ALLOWED_HOST","calendar.example.com");
  vi.stubEnv("CHESS_CALENDAR_API_URL","https://calendar.example.com/v1/events");
  vi.stubEnv("CHESS_CALENDAR_CANCEL_API_URL","https://calendar.example.com/v1/cancel");
  vi.stubEnv("CHESS_CALENDAR_STATUS_API_URL","https://calendar.example.com/v1/status");
  const mock=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   id:"provider-event",status:"accepted",
  })});
  vi.stubGlobal("fetch",mock);
  const reply=await lookupCalendarEvent({tenantSlug:"test",businessId:"unit",
   workItemId:"task",idempotencyKey:"key",providerEventId:null,action:"CREATE"});
  expect(reply).toEqual({id:"provider-event",status:"accepted"});
  const args=mock.mock.calls[0] as unknown as [string,RequestInit];
  expect(args[0]).toBe("https://calendar.example.com/v1/status");
  expect(args[1].redirect).toBe("error");
  expect(String(args[1].body)).not.toContain("clientProfile");
 });
 it("does not accept a provider-approved creation without an event ID",async()=>{
  vi.stubEnv("CHESS_CALENDAR_SYNC_ENABLED","true");
  vi.stubEnv("CHESS_CALENDAR_API_KEY","sandbox-placeholder");
  vi.stubEnv("CHESS_CALENDAR_ALLOWED_HOST","calendar.example.com");
  vi.stubEnv("CHESS_CALENDAR_API_URL","https://calendar.example.com/v1/events");
  vi.stubEnv("CHESS_CALENDAR_CANCEL_API_URL","https://calendar.example.com/v1/cancel");
  vi.stubEnv("CHESS_CALENDAR_STATUS_API_URL","https://calendar.example.com/v1/status");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   status:"accepted",
  })}));
  await expect(lookupCalendarEvent({tenantSlug:"test",businessId:"unit",
   workItemId:"task",idempotencyKey:"key",providerEventId:null,action:"CREATE"}))
   .rejects.toThrow();
 });
});
