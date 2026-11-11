import {describe,it,expect} from "vitest";
import {classifyWorkerRun} from "./worker-health";
describe("scheduler health classification",()=>{
 it("records success when no items are blocked",()=>{
  expect(classifyWorkerRun(2,0)).toBe("SUCCESS");
 });
 it("labels blocked or uncertain outcomes as degraded",()=>{
  expect(classifyWorkerRun(2,1)).toBe("DEGRADED");
 });
 it("does not mark a failed worker as healthy",()=>{
  expect(classifyWorkerRun(0,0,true)).toBe("FAILED");
 });
});
