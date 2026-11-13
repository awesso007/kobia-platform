import {describe,it,expect} from "vitest";
import {validAppointmentWindow,isAppointmentConflict} from "./appointments";
describe("appointment safety",()=>{
 const now=new Date("2026-11-11T00:00:00Z");
 it("accepts a short booked meeting in the future",()=>{
  expect(validAppointmentWindow(new Date("2026-11-12T17:00:00Z"),
   new Date("2026-11-12T17:30:00Z"),now)).toBe(true);
 });
 it("rejects inverted, excessive, stale and far-future appointments",()=>{
  expect(validAppointmentWindow(new Date("2026-11-12T17:30:00Z"),
   new Date("2026-11-12T17:00:00Z"),now)).toBe(false);
  expect(validAppointmentWindow(new Date("2026-11-12T17:00:00Z"),
   new Date("2026-11-13T00:00:00Z"),now)).toBe(false);
  expect(validAppointmentWindow(new Date("2020-01-01T00:00:00Z"),
   new Date("2020-01-01T00:30:00Z"),now)).toBe(false);
  expect(validAppointmentWindow(new Date("2099-01-01T00:00:00Z"),
   new Date("2099-01-01T00:30:00Z"),now)).toBe(false);
 });
 it("maps the PostgreSQL exclusion constraint to a safe conflict",()=>{
  expect(isAppointmentConflict({code:"23P01"})).toBe(true);
  expect(isAppointmentConflict({code:"P2004",message:"ChessAppointment_no_staff_overlap"})).toBe(true);
  expect(isAppointmentConflict({code:"P2002",message:"conflicting appointment"})).toBe(true);
  expect(isAppointmentConflict({code:"INTERNAL_ERROR",message:"unrelated"})).toBe(false);
 });
});
