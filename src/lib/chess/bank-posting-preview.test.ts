import {describe,expect,it} from "vitest";
import {createBankPostingPreview,BankPostingPreviewError} from "./bank-posting-preview";
const digest="a".repeat(64);
const review={
 status:"APPROVED",createdByClerkUserId:"creator",
 reviewedByClerkUserId:"reviewer",approvedAccountId:"income",
 transactionDigest:digest,
};
const actor={clerkUserId:"independent",role:"ADMIN",status:"ACTIVE"};
const src={id:"bank-txn",bankAccountGlId:"checking",amountCents:12055n,
 status:"UNMATCHED",fingerprint:digest};

describe("CHESS M5 independent bank posting preview",()=>{
 it("generates balanced inflow and outflow drafts without posting",()=>{
  expect(createBankPostingPreview(review,src,actor)).toEqual({
   bankTransactionId:"bank-txn",bankGlAccountId:"checking",
   offsetGlAccountId:"income",
   lines:[
    {accountId:"checking",debitCents:"12055",creditCents:"0"},
    {accountId:"income",debitCents:"0",creditCents:"12055"},
   ],
   totalDebitCents:"12055",totalCreditCents:"12055",postedToLedger:false,
   transactionDigest:digest,
  });
  const out=createBankPostingPreview(review,{...src,amountCents:-12055n},actor);
  expect(out.lines).toEqual([
   {accountId:"checking",debitCents:"0",creditCents:"12055"},
   {accountId:"income",debitCents:"12055",creditCents:"0"},
  ]);
  expect(out.postedToLedger).toBe(false);
 });
 it("rejects creator/reviewer as operator and a non-admin operator",()=>{
  for(const id of ["creator","reviewer"]){
   expect(()=>createBankPostingPreview(review,src,{...actor,clerkUserId:id}))
    .toThrow(BankPostingPreviewError);
  }
  expect(()=>createBankPostingPreview(review,src,{...actor,role:"MEMBER"}))
   .toThrow();
  expect(()=>createBankPostingPreview(review,src,{...actor,status:"SUSPENDED"}))
   .toThrow();
 });
 it("rejects unapproved, stale, zero, matched and same-account proposals",()=>{
  expect(()=>createBankPostingPreview({...review,status:"PENDING"},src,actor)).toThrow();
  expect(()=>createBankPostingPreview({...review,transactionDigest:"b".repeat(64)},src,actor)).toThrow();
  expect(()=>createBankPostingPreview({...review,approvedAccountId:"checking"},src,actor)).toThrow();
  expect(()=>createBankPostingPreview(review,{...src,status:"MATCHED"},actor)).toThrow();
  expect(()=>createBankPostingPreview(review,{...src,amountCents:0n},actor)).toThrow();
  expect(()=>createBankPostingPreview({...review,reviewedByClerkUserId:null},src,actor)).toThrow();
  expect(()=>createBankPostingPreview({...review,transactionDigest:"not-a-digest"},src,actor)).toThrow();
 });
});
