import * as React from "react";
import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import ChessDeskDirectory from "@/app/app/(crm)/chess-desk/ChessDeskDirectory";
describe("Round 27 role-scoped CHESS service desk",()=>{
 it("shows employee routes but no administrator routes to ordinary members",()=>{
  const html=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={false} hasBusiness={true}/>);
  for(const path of ["/app/work-items","/app/client-profiles","/app/action-approvals"])
   expect(html).toContain('href="'+path+'"');
  for(const path of ["/app/business-units","/app/finance-operations",
   "/app/service-billing","/app/security-operations"])
   expect(html).not.toContain('href="'+path+'"');
  expect(html).toContain("Machine worker callbacks");
 });
 it("exposes existing scoped administrator workspaces and not direct machine callbacks",()=>{
  const html=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={true} hasBusiness={true}/>);
  for(const path of ["/app/business-units","/app/finance-operations",
   "/app/regulated-services","/app/service-billing","/app/operations-reports",
   "/app/security-operations","/app/ai-operations"])
   expect(html).toContain('href="'+path+'"');
  expect(html).not.toContain('href="/api/chess/payroll-status/run"');
 });
 it("does not show client record links to staff with no business unit",()=>{
  const html=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={false} hasBusiness={false}/>);
  expect(html).toContain("No active business assignment");
  expect(html).not.toContain('href="/app/client-profiles"');
 });
});
