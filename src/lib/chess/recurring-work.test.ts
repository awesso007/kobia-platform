import {afterEach,describe,it,expect,vi} from "vitest";
import {isAuthorizedRecurrenceWorker,recurrenceInput} from "./recurring-work";
afterEach(()=>vi.unstubAllEnvs());
describe("recurrence controls",()=>{
 it("denies missing and weak worker tokens",()=>{
  vi.stubEnv("CHESS_WORKFLOW_WORKER_TOKEN","");
  expect(isAuthorizedRecurrenceWorker("anything")).toBe(false);
  vi.stubEnv("CHESS_WORKFLOW_WORKER_TOKEN","short");
  expect(isAuthorizedRecurrenceWorker("short")).toBe(false);
 });
 it("requires the exact configured scheduler token",()=>{
  vi.stubEnv("CHESS_WORKFLOW_WORKER_TOKEN","x".repeat(48));
  expect(isAuthorizedRecurrenceWorker("x".repeat(48))).toBe(true);
  expect(isAuthorizedRecurrenceWorker("y".repeat(48))).toBe(false);
 });
 it("limits recurrence cadence and validates UTC ISO timestamps",()=>{
  const data={businessId:"biz1",title:"Monthly close review",
   frequency:"MONTHLY",interval:1,firstRunAt:"2026-12-31T15:00:00.000Z"};
  expect(recurrenceInput.safeParse(data).success).toBe(true);
  expect(recurrenceInput.safeParse({...data,interval:0}).success).toBe(false);
  expect(recurrenceInput.safeParse({...data,firstRunAt:"not-a-date"}).success).toBe(false);
 });
});
