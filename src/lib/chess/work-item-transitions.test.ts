import {describe,it,expect} from "vitest";
import {isAllowedWorkTransition} from "./work-item-transitions";
describe("CHESS employee work item lifecycle",()=>{
 it("permits assigned workflows",()=>{
  expect(isAllowedWorkTransition("TODO","IN_PROGRESS")).toBe(true);
  expect(isAllowedWorkTransition("IN_PROGRESS","BLOCKED")).toBe(true);
  expect(isAllowedWorkTransition("BLOCKED","IN_PROGRESS")).toBe(true);
  expect(isAllowedWorkTransition("IN_PROGRESS","COMPLETED")).toBe(true);
 });
 it("rejects skipping review and reopening terminal tasks",()=>{
  expect(isAllowedWorkTransition("TODO","COMPLETED")).toBe(false);
  expect(isAllowedWorkTransition("COMPLETED","TODO")).toBe(false);
  expect(isAllowedWorkTransition("CANCELLED","IN_PROGRESS")).toBe(false);
  expect(isAllowedWorkTransition("BLOCKED","COMPLETED")).toBe(false);
 });
});
