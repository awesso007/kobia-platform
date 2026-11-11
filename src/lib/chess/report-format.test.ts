import {describe,expect,it} from "vitest";
import {quoteChessCsvCell,formatChessUsdCents} from "./report-format";
describe("M7 safe reporting renderers",()=>{
 it("prevents spreadsheet formula injection",()=>{
  for(const input of ["=2+2","+run","-1","@SUM(A1)","  =A1","\t@a"])
   expect(quoteChessCsvCell(input).startsWith('"\'')).toBe(true);
  expect(quoteChessCsvCell('A "quoted" value')).toBe('"A ""quoted"" value"');
  expect(quoteChessCsvCell("Accounting")).toBe('"Accounting"');
 });
 it("formats invoice cents without a floating-point conversion",()=>{
  expect(formatChessUsdCents("9007199254740993")).toBe("$90,071,992,547,409.93");
  expect(formatChessUsdCents("0")).toBe("$0.00");
  expect(formatChessUsdCents("-105")).toBe("-$1.05");
  expect(()=>formatChessUsdCents("NaN")).toThrow();
 });
});
