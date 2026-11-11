import { describe, expect, it } from "vitest";
import { assignmentInput, businessUnitInput, isBusinessAdmin } from "./business-units";
describe("business unit validation and management", () => {
 it("accepts valid unit definitions", () => {
  expect(businessUnitInput.parse({slug:"chess-mortgage",name:"Chess Mortgage Group"}).slug).toBe("chess-mortgage");
 });
 it("rejects malformed or suspicious identifiers", () => {
  expect(businessUnitInput.safeParse({slug:"../other",name:"bad"}).success).toBe(false);
  expect(assignmentInput.safeParse({businessId:"a",clerkUserId:"b",role:"OWNER"}).success).toBe(false);
 });
 it("limits assignment administration to owners and admins", () => {
  expect(isBusinessAdmin("OWNER")).toBe(true);
  expect(isBusinessAdmin("ADMIN")).toBe(true);
  expect(isBusinessAdmin("MEMBER")).toBe(false);
  expect(isBusinessAdmin("VIEWER")).toBe(false);
 });
});
