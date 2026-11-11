import {describe,it,expect} from "vitest";
import {maySyncCalendar} from "./calendar-preferences";
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
