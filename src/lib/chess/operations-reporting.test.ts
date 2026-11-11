import {describe,expect,it} from "vitest";
import {reportWindow,invoiceSummaryGroups} from "./operations-reporting";
describe("M7 business operations report integrity",()=>{
 it("computes exact UTC month boundaries including leap years",()=>{
  const range=reportWindow("2028-02");
  expect(range.from.toISOString()).toBe("2028-02-01T00:00:00.000Z");
  expect(range.to.toISOString()).toBe("2028-03-01T00:00:00.000Z");
  expect(()=>reportWindow("2026-13")).toThrow();
  expect(()=>reportWindow("2026-00")).toThrow();
 });
 it("formats integer billing cents losslessly without inventing paid revenue",()=>{
  expect(invoiceSummaryGroups([{status:"SENT",_count:{_all:2},
   _sum:{amountCents:128000000000n}}])).toEqual({
   SENT:{invoices:2,amountCents:"128000000000"},
  });
  expect(invoiceSummaryGroups([{status:"DRAFT",_count:{_all:0},
   _sum:{amountCents:null}}]).DRAFT.amountCents).toBe("0");
 });
});
