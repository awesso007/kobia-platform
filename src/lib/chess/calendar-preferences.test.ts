import {describe,it,expect} from "vitest";
import {maySyncCalendar,maySyncAppointmentCalendar} from "./calendar-preferences";
describe("private employee calendar consent",()=>{
 it("defaults to denied",()=>{
  expect(maySyncCalendar(null)).toBe(false);
  expect(maySyncCalendar({enabled:true,acknowledgedAt:null,revokedAt:null})).toBe(false);
 });
 it("stops sharing after withdrawal",()=>{
  const when=new Date("2026-11-10T19:00:00Z");
  expect(maySyncCalendar({enabled:true,acknowledgedAt:when,revokedAt:null})).toBe(true);
  expect(maySyncCalendar({enabled:true,acknowledgedAt:when,revokedAt:when})).toBe(false);
  expect(maySyncCalendar({enabled:false,acknowledgedAt:when,revokedAt:null})).toBe(false);
 });
});

describe("appointment-specific employee calendar consent",()=>{
 const base={enabled:true,acknowledgedAt:new Date("2026-11-10T18:00:00Z"),
  revokedAt:null,appointmentEnabled:false,appointmentAcknowledgedAt:null,
  appointmentRevokedAt:null};
 it("never assumes task consent authorizes appointment sharing",()=>{
  expect(maySyncCalendar(base)).toBe(true);
  expect(maySyncAppointmentCalendar(base)).toBe(false);
 });
 it("requires a separate positive appointment acknowledgment",()=>{
  expect(maySyncAppointmentCalendar({...base,appointmentEnabled:true})).toBe(false);
  expect(maySyncAppointmentCalendar({...base,appointmentEnabled:true,
   appointmentAcknowledgedAt:new Date("2026-11-10T18:30:00Z")})).toBe(true);
 });
 it("revokes appointments after either global or appointment-specific opt-out",()=>{
  const approved={...base,appointmentEnabled:true,
   appointmentAcknowledgedAt:new Date("2026-11-10T18:30:00Z")};
  expect(maySyncAppointmentCalendar({...approved,enabled:false})).toBe(false);
  expect(maySyncAppointmentCalendar({...approved,
   appointmentRevokedAt:new Date("2026-11-10T19:00:00Z")})).toBe(false);
 });
});
