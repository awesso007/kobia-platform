import {describe,it,expect} from "vitest";
import {payrollHasIndependentActors} from "./payroll-execution";
describe("CHESS independent payroll execution identities",()=>{
 it("requires three distinct nonempty identities",()=>{
  expect(payrollHasIndependentActors("a","b","c")).toBe(true);
  expect(payrollHasIndependentActors("a","a","c")).toBe(false);
  expect(payrollHasIndependentActors("a","b","b")).toBe(false);
  expect(payrollHasIndependentActors("a","b","a")).toBe(false);
  expect(payrollHasIndependentActors("a",null,"c")).toBe(false);
 });
});
