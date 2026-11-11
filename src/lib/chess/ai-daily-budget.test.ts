import {describe,it,expect} from "vitest";
import {chessAiDailyLimit,chessAiUtcDay} from "./ai-daily-budget";

describe("M7 AI request budget controls",()=>{
 it("reserves UTC days, not user/browser local dates",()=>{
  expect(chessAiUtcDay(new Date("2026-11-11T23:59:59.999Z")).toISOString())
   .toBe("2026-11-11T00:00:00.000Z");
  expect(chessAiUtcDay(new Date("2026-11-12T00:00:00.000Z")).toISOString())
   .toBe("2026-11-12T00:00:00.000Z");
 });
 it("fails closed for invalid daily AI budget settings",()=>{
  expect(chessAiDailyLimit()).toBe(25);
  expect(chessAiDailyLimit("")).toBe(25);
  expect(chessAiDailyLimit("5")).toBe(5);
  for(const value of ["0","101","-1","1.5","abc"])
   expect(()=>chessAiDailyLimit(value)).toThrow();
 });
});
