import * as React from "react";
import {describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import RecurringPlansPanel from "@/app/app/(crm)/service-billing/RecurringPlansPanel";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));
describe("Round 27 M7 employee-facing recurring invoice inspection",()=>{
 const base={id:"fictional-plan",businessId:"business",clientProfileId:"client",
  serviceCaseId:"case",service:"BOOKKEEPING",descriptionCode:"BOOKKEEPING_MONTHLY",
  amountCents:"12500",status:"ACTIVE",nextDraftAt:"2026-11-01T00:00:00Z",
  lastDraftAt:null,approvedAt:"2026-10-20T00:00:00Z",createdAt:"2026-10-01T00:00:00Z",
  updatedAt:"2026-10-21T00:00:00Z",mayApprove:false,mayPause:true};
 it("distinguishes worker inspection from invoice creation and shows a blocked plan's last check",()=>{
  const html=renderToStaticMarkup(<RecurringPlansPanel businessId="business"
   cases={[]} schedulerEnabled={true}
   plans={[{...base,lastInspectedAt:"2026-11-11T03:12:00Z"}]}/>);
  expect(html).toContain("Worker checked 2026-11-11 03:12 UTC");
  expect(html).toContain("not that it");
 });
 it("explicitly labels never-seen plans and disabled processing",()=>{
  const html=renderToStaticMarkup(<RecurringPlansPanel businessId="business"
   cases={[]} schedulerEnabled={false}
   plans={[{...base,lastInspectedAt:null}]}/>);
  expect(html).toContain("Never checked by scheduled worker");
  expect(html).toContain("Disabled until subscription");
  expect(html).toContain("No automatic charge");
 });
});
