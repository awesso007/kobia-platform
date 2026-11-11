import {describe,it,expect} from "vitest";
import {overdueAlertKey} from "./overdue-alerts";
describe("deduplicated overdue notifications",()=>{
 it("makes repeated runs on the same UTC date idempotent",()=>{
  const first=new Date("2026-11-10T00:15:00Z");
  const second=new Date("2026-11-10T23:59:00Z");
  expect(overdueAlertKey("work1",first,"OVERDUE","staff")).toBe(
   overdueAlertKey("work1",second,"OVERDUE","staff"));
 });
 it("separates recipients and different days",()=>{
  const first=new Date("2026-11-10T00:15:00Z");
  const next=new Date("2026-11-11T00:15:00Z");
  expect(overdueAlertKey("work1",first,"OVERDUE","staff")).not.toBe(
   overdueAlertKey("work1",next,"OVERDUE","staff"));
  expect(overdueAlertKey("work1",first,"BLOCKED","manager")).not.toBe(
   overdueAlertKey("work1",first,"BLOCKED","other-manager"));
 });
});
