import {describe,expect,it} from "vitest";
import {readFileSync,existsSync} from "node:fs";

const screens=[
 {milestone:"M1",file:"src/app/app/(crm)/client-profiles/page.tsx",
  marker:"listClientProfiles",api:"src/app/api/chess/service-cases/route.ts"},
 {milestone:"M2",file:"src/app/app/(crm)/business-units/BusinessUnitAdmin.tsx",
  marker:"/api/chess/employee-assignments",api:"src/app/api/chess/employee-assignments/route.ts"},
 {milestone:"M3",file:"src/app/app/(crm)/client-documents/ServiceDocumentPanel.tsx",
  marker:"/api/chess/documents",api:"src/app/api/chess/documents/route.ts"},
 {milestone:"M4",file:"src/app/app/(crm)/work-items/WorkItemsClient.tsx",
  marker:"/api/chess/work-items",api:"src/app/api/chess/work-items/route.ts"},
 {milestone:"M5",file:"src/app/app/(crm)/finance-operations/[caseId]/BankReviewClient.tsx",
  marker:"/api/chess/bank-reconciliation",api:"src/app/api/chess/bank-reconciliation/route.ts"},
 {milestone:"M6",file:"src/app/app/(crm)/regulated-services/[caseId]/RegulatedWorkflowClient.tsx",
  marker:"/api/chess/regulated-handoffs",api:"src/app/api/chess/regulated-handoffs/route.ts"},
 {milestone:"M7",file:"src/app/app/(crm)/service-billing/RecurringPlansPanel.tsx",
  marker:"/api/chess/recurring-billing",api:"src/app/api/chess/recurring-billing/route.ts"},
 {milestone:"M8",file:"src/app/app/(crm)/security-operations/page.tsx",
  marker:"getChessSecurityOverview",api:"src/app/api/chess/worker-health/route.ts"},
] as const;

describe("Round 27 M1–M8 verified employee UI entry points",()=>{
 for(const s of screens)it(s.milestone+" has a real screen and bound backend",()=>{
  expect(existsSync(s.file),s.file).toBe(true);
  expect(existsSync(s.api),s.api).toBe(true);
  expect(readFileSync(s.file,"utf8")).toContain(s.marker);
 });
 it("does not expose protected machine-only jobs as navigational actions",()=>{
  const desk=readFileSync("src/app/app/(crm)/chess-desk/ChessDeskDirectory.tsx","utf8");
  for(const route of ["/api/chess/recurring-billing/run",
   "/api/chess/payroll-status/run","/api/chess/audit-archive/run",
   "/api/chess/scan-worker","/api/chess/incident-health",
   "/api/chess/staging-attestation"])
   expect(desk).not.toContain('href="'+route+'"');
 });
});
