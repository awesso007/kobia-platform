import {afterEach,describe,expect,it,vi} from "vitest";
import {calendarGatewayConfigured} from "./calendar-provider";
afterEach(()=>vi.unstubAllEnvs());
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
