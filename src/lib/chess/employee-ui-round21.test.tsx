import {describe,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import BankReviewClient from "@/app/app/(crm)/finance-operations/[caseId]/BankReviewClient";
import PayrollDispatchClient from "@/app/app/(crm)/finance-operations/[caseId]/PayrollDispatchClient";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));

describe("Round 21 protected employee UI render states",()=>{
 it("does not render a bank POST form without a separately fetched review-bound preview",()=>{
  const props={
   businessId:"business",clientProfileId:"fictional-client",
   serviceCaseId:"case",service:"BOOKKEEPING" as const,
   transactions:[{id:"tx-1",postedDate:"2026-10-11T00:00:00.000Z",
    description:"Fictional bank record",amountCents:"12500",bankAccountId:"bank"}],
   accounts:[{id:"offset",code:"4010",name:"Revenue",type:"REVENUE"}],
   reviews:[{id:"review",status:"APPROVED",legacyBankTransactionId:"tx-1",
    suggestedAccountId:"offset",approvedAccountId:"offset",
    confidenceBasisPoints:9900,updatedAt:"2026-10-11T00:00:00.000Z"}],
  };
  const locked=renderToStaticMarkup(<BankReviewClient {...props} postingEnabled={false}/>);
  const configured=renderToStaticMarkup(<BankReviewClient {...props} postingEnabled={true}/>);
  for(const markup of [locked,configured]){
   expect(markup).toContain("Preview balanced entry (no posting)");
   expect(markup).not.toContain("Post approved journal to ledger");
   expect(markup).toContain("Nothing");
  }
 });
 it("keeps payroll execution out of disabled human workspaces",()=>{
  const props={businessId:"business",clientProfileId:"fictional-client",
   dispatches:[{id:"dispatch",legacyPayRunId:"fictional-run",status:"UNKNOWN",
    submittedAt:null,providerCheckedAt:null}]};
  const disabled=renderToStaticMarkup(<PayrollDispatchClient {...props} executionEnabled={false}/>);
  expect(disabled).toContain("External payroll submission disabled");
  expect(disabled).toContain("fictional-run");
  expect(disabled).toContain("UNKNOWN");
  expect(disabled).not.toContain("Submit approved run to provider");
 });
 it("when activated, requires deliberate acknowledgement before showing a usable submit control",()=>{
  const markup=renderToStaticMarkup(<PayrollDispatchClient
   businessId="business" clientProfileId="fictional-client"
   dispatches={[]} executionEnabled={true}/>);
  expect(markup).toContain("Type SUBMIT PAYROLL");
  expect(markup).toContain("Submit approved run to provider");
  expect(markup).toContain("disabled");
 });
});
