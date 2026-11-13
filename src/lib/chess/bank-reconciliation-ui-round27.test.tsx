import * as React from "react";
import {describe,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import BankReviewClient from "@/app/app/(crm)/finance-operations/[caseId]/BankReviewClient";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));
const options={businessId:"unit",clientProfileId:"fictional-client",
 serviceCaseId:"fictional-case",service:"BOOKKEEPING" as const,
 transactions:[],accounts:[],postingEnabled:false};
describe("Round 27 M5 read-only legacy journal verification UI",()=>{
 it("retains a reconciliation action for approved reviews even without unmatched source transactions",()=>{
  const html=renderToStaticMarkup(<BankReviewClient {...options}
   reviews={[{id:"approved-review",status:"APPROVED",
    legacyBankTransactionId:"existing-categorized-row",suggestedAccountId:null,
    approvedAccountId:"revenue-account",confidenceBasisPoints:9500,
    updatedAt:"2026-11-11T00:00:00Z"}]}/>);
  expect(html).toContain("Verify previous ledger posting (read-only)");
  expect(html).toContain("Check legacy journal");
  expect(html).toContain("No unmatched transactions available");
  expect(html).not.toContain("Post approved journal to ledger");
 });
 it("does not expose reconciliation controls for an unapproved review",()=>{
  const html=renderToStaticMarkup(<BankReviewClient {...options}
   reviews={[{id:"pending-review",status:"PENDING",
    legacyBankTransactionId:"existing-categorized-row",suggestedAccountId:null,
    approvedAccountId:null,confidenceBasisPoints:null,
    updatedAt:"2026-11-11T00:00:00Z"}]}/>);
  expect(html).not.toContain("Check legacy journal");
 });
});
