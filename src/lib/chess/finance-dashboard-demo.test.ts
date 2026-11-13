import {describe,expect,it} from "vitest";
import {permitUnmappedChessDemoFinance} from "./finance-dashboard";

describe("isolated CHESS demo finance summary scope",()=>{
 it("allows only an explicitly enabled, unmapped fictional tenant",()=>{
  expect(permitUnmappedChessDemoFinance("chess-demo",null,true)).toBe(true);
  expect(permitUnmappedChessDemoFinance("chess-demo",null,false)).toBe(false);
  expect(permitUnmappedChessDemoFinance("fig",null,true)).toBe(false);
  expect(permitUnmappedChessDemoFinance("chess-demo","live-ledger-id",true)).toBe(false);
  expect(permitUnmappedChessDemoFinance("other-tenant",null,false)).toBe(false);
 });
});
