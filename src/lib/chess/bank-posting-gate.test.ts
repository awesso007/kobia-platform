import {describe,it,expect} from "vitest";
import {chessBankPostingEnabled,postingSourceRef,bankGlAccountMatchesType} from "./bank-posting-gate";
const approved={
 CHESS_BANK_POSTING_ENABLED:"true",
 CHESS_BANK_POSTING_POLICY_APPROVED:"true",
 CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED:"true",
 CHESS_BANK_POSTING_OPERATOR_APPROVED:"true",
};
describe("CHESS financial execution is disabled without independent release evidence",()=>{
 it("fails closed when any policy, provider or operator flag is absent",()=>{
  expect(chessBankPostingEnabled({})).toBe(false);
  for(const key of Object.keys(approved)){
   expect(chessBankPostingEnabled({...approved,[key]:undefined})).toBe(false);
   expect(chessBankPostingEnabled({...approved,[key]:"false"})).toBe(false);
  }
  expect(chessBankPostingEnabled(approved)).toBe(true);
 });
 it("allows only a current correctly typed bank GL",()=>{
  for(const type of ["CHECKING","SAVINGS","MONEY_MARKET"]){
   expect(bankGlAccountMatchesType(type,"ASSET")).toBe(true);
   expect(bankGlAccountMatchesType(type,"LIABILITY")).toBe(false);
  }
  expect(bankGlAccountMatchesType("CREDIT_CARD","LIABILITY")).toBe(true);
  expect(bankGlAccountMatchesType("CREDIT_CARD","ASSET")).toBe(false);
  expect(bankGlAccountMatchesType("LOAN","ASSET")).toBe(false);
  expect(bankGlAccountMatchesType("OTHER","ASSET")).toBe(false);
 });
 it("uses a stable opaque source reference and rejects malformed IDs",()=>{
  expect(postingSourceRef("bank_review_123")).toBe("chess-bank-review:bank_review_123");
  expect(()=>postingSourceRef("../invalid")).toThrow();
  expect(()=>postingSourceRef("short")).toThrow();
 });
});
