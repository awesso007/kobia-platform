import {afterEach,describe,expect,it,vi} from "vitest";
import {submitAppointmentCalendarEvent,lookupAppointmentCalendarEvent}
 from "./calendar-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function enableSandbox(){
 vi.stubEnv("CHESS_CALENDAR_SYNC_ENABLED","true");
 vi.stubEnv("CHESS_CALENDAR_API_KEY","test-token");
 vi.stubEnv("CHESS_CALENDAR_ALLOWED_HOST","calendar.sandbox.example");
 vi.stubEnv("CHESS_CALENDAR_API_URL","https://calendar.sandbox.example/events");
 vi.stubEnv("CHESS_CALENDAR_CANCEL_API_URL","https://calendar.sandbox.example/cancel");
 vi.stubEnv("CHESS_CALENDAR_STATUS_API_URL","https://calendar.sandbox.example/status");
}
describe("appointment-specific calendar gateway contract",()=>{
 it("submits only a private generic appointment and a stable idempotency key",async()=>{
  enableSandbox();
  const http=vi.fn().mockResolvedValue({
   ok:true,json:async()=>({id:"remote-test-1",status:"accepted"}),
  });
  vi.stubGlobal("fetch",http);
  const payload={
   tenantSlug:"staging",businessId:"unit",appointmentId:"apt",
   recipientClerkUserId:"staff",startsAt:"2026-11-20T18:00:00.000Z",
   endsAt:"2026-11-20T18:30:00.000Z",summary:"CHESS appointment" as const,
   visibility:"private" as const,idempotencyKey:"appointment-calendar:apt",
  };
  const result=await submitAppointmentCalendarEvent(payload);
  expect(result.status).toBe("accepted");
  const call=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(call[0]).toBe("https://calendar.sandbox.example/events");
  expect(call[1].redirect).toBe("error");
  const body=JSON.parse(String(call[1].body));
  expect(body.summary).toBe("CHESS appointment");
  expect(body).not.toHaveProperty("subject");
  expect(body).not.toHaveProperty("clientProfileId");
  expect(body).not.toHaveProperty("workItemId");
  expect((call[1].headers as Record<string,string>)["Idempotency-Key"])
   .toBe("appointment-calendar:apt");
 });
 it("rejects accidental client or appointment subject leakage before any network call",async()=>{
  enableSandbox();
  const http=vi.fn();
  vi.stubGlobal("fetch",http);
  await expect(submitAppointmentCalendarEvent({
   tenantSlug:"staging",businessId:"unit",appointmentId:"apt",
   recipientClerkUserId:"staff",startsAt:"2026-11-20T18:00:00.000Z",
   endsAt:"2026-11-20T18:30:00.000Z",summary:"CHESS appointment",
   visibility:"private",idempotencyKey:"key",subject:"private",
  } as Parameters<typeof submitAppointmentCalendarEvent>[0])).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
 });
 it("does not accept gateway create success without remote ID",async()=>{
  enableSandbox();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({
   ok:true,json:async()=>({status:"accepted"}),
  }));
  await expect(lookupAppointmentCalendarEvent({
   tenantSlug:"staging",businessId:"unit",appointmentId:"apt",
   idempotencyKey:"key",providerEventId:null,action:"CREATE",
  })).rejects.toThrow();
 });
});
