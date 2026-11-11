import {describe,expect,it} from "vitest";
import {mayReadPortfolio,portfolioTotals,type PortfolioUnitMetrics}
 from "./operations-portfolio";
const empty=(businessId:string):PortfolioUnitMetrics=>({
 businessId,businessName:"Test business "+businessId,caseCounts:[],taskCounts:[],
 aiReviewCounts:[],regulatedCoordinationCounts:[],clientConsentCounts:[],
 invoiceCountsAndAmounts:{},
});
describe("M7 owner-only cross-business operational portfolio",()=>{
 it("rejects inactive and non-admin tenant members, even if assigned manager",()=>{
  expect(mayReadPortfolio("OWNER","ACTIVE")).toBe(true);
  expect(mayReadPortfolio("ADMIN","ACTIVE")).toBe(true);
  expect(mayReadPortfolio("MEMBER","ACTIVE")).toBe(false);
  expect(mayReadPortfolio("VIEWER","ACTIVE")).toBe(false);
  expect(mayReadPortfolio("OWNER","SUSPENDED")).toBe(false);
  expect(mayReadPortfolio("ADMIN","INVITED")).toBe(false);
 });
 it("sums separate units without converting cents to unsafe floats or claiming payment",()=>{
  const a=empty("a"),b=empty("b");
  a.caseCounts=[{service:"TAX",status:"ACTIVE",count:3}];
  a.taskCounts=[{status:"TODO",count:4}];
  a.invoiceCountsAndAmounts={SENT:{invoices:2,amountCents:"9007199254740993"}};
  b.caseCounts=[{service:"PAYROLL",status:"ACTIVE",count:1}];
  b.aiReviewCounts=[{status:"PENDING",count:5}];
  b.regulatedCoordinationCounts=[{service:"MORTGAGE",status:"DRAFT",count:2}];
  b.clientConsentCounts=[{status:"GRANTED",count:6}];
  b.invoiceCountsAndAmounts={DRAFT:{invoices:1,amountCents:"150"}};
  expect(portfolioTotals([a,b])).toEqual({
   cases:4,tasks:4,aiReviews:5,regulated:2,consents:6,
   invoices:3,invoiceAmountCents:"9007199254741143",
  });
  expect(portfolioTotals([]).invoiceAmountCents).toBe("0");
 });
});
