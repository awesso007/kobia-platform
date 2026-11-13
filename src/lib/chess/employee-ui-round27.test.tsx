import * as React from "react";
import {describe,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import BusinessUnitAdmin from "@/app/app/(crm)/business-units/BusinessUnitAdmin";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));
describe("Round 27 employee-offboarding UI",()=>{
 it("explains the irreversible service-grant consequences to authorized administrators",()=>{
  const html=renderToStaticMarkup(<BusinessUnitAdmin
   selectedBusiness={{id:"unit",name:"Fictional test business"}}
   directory={{members:[{clerkUserId:"staff",displayName:"Test person",
    role:"MEMBER"}],assignments:[{id:"assignment",clerkUserId:"staff",
    role:"SUPPORT",assignedAt:"2026-11-11T00:00:00Z"}]}}/>);
  expect(html).toContain("Revoke unit access");
  expect(html).toContain("revokes every active client-service grant");
  expect(html).toContain("does not restore those grants");
  expect(html).toContain("Other businesses are unaffected");
 });
 it("does not render employee administration without a selected business",()=>{
  const html=renderToStaticMarkup(<BusinessUnitAdmin selectedBusiness={null}
   directory={null}/>);
  expect(html).not.toContain("Revoke unit access");
  expect(html).not.toContain("Active assignments");
 });
});
