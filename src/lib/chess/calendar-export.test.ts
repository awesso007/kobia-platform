import {describe,it,expect} from "vitest";
import {toPrivateChessCalendar} from "./calendar-export";
describe("private iCalendar exports",()=>{
 it("emits valid UTC event timestamps without confidential titles",()=>{
  const ics=toPrivateChessCalendar([
   {id:"id1",dueAt:new Date("2026-12-01T16:45:00.000Z"),status:"TODO"},
  ],new Date("2026-11-10T12:00:00.000Z"));
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("DTSTART:20261201T164500Z");
  expect(ics).toContain("CLASS:PRIVATE");
  expect(ics).not.toContain("Customer");
 });
 it("never discloses appointment subjects or client details",()=>{
  const ics=toPrivateChessCalendar([{
   id:"appt-1",dueAt:new Date("2026-12-01T17:00:00Z"),
   status:"SCHEDULED",kind:"APPOINTMENT",
  }]);
  expect(ics).toContain("SUMMARY:CHESS appointment");
  expect(ics).not.toContain("clientProfileId");
 });
 it("omits canceled and undated work items",()=>{
  const ics=toPrivateChessCalendar([
   {id:"no-date",dueAt:null,status:"TODO"},
   {id:"canceled",dueAt:new Date(),status:"CANCELLED"},
  ]);
  expect(ics).not.toContain("BEGIN:VEVENT");
 });
});
