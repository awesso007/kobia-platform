import {describe,it,expect} from "vitest";
import {nextRecurrenceUtc} from "./recurrence-clock";
describe("UTC recurring CHESS work schedules",()=>{
 it("advances daily and weekly without local-time DST drift",()=>{
  const d=new Date("2026-03-07T16:30:00.000Z");
  expect(nextRecurrenceUtc(d,"DAILY",1,7).toISOString()).toBe("2026-03-08T16:30:00.000Z");
  expect(nextRecurrenceUtc(d,"WEEKLY",2,7).toISOString()).toBe("2026-03-21T16:30:00.000Z");
 });
 it("retains the intended month-end day",()=>{
  const jan=new Date("2028-01-31T09:00:00.000Z");
  const feb=nextRecurrenceUtc(jan,"MONTHLY",1,31);
  expect(feb.toISOString()).toBe("2028-02-29T09:00:00.000Z");
  expect(nextRecurrenceUtc(feb,"MONTHLY",1,31).toISOString()).toBe("2028-03-31T09:00:00.000Z");
 });
 it("fails closed for invalid intervals and day anchors",()=>{
  const d=new Date();
  expect(()=>nextRecurrenceUtc(d,"DAILY",0,1)).toThrow();
  expect(()=>nextRecurrenceUtc(d,"MONTHLY",1,32)).toThrow();
 });
});
