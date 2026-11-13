import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync("src/app/app/(crm)/"+path,"utf8");

describe("Round 33 demo route and UI failure-state regressions",()=>{
 it("does not treat failed work-item or notification loads as empty results",()=>{
  const source=read("work-items/page.tsx");
  expect(source).toContain("listChessWorkItems(selected.id).catch(()=>null)");
  expect(source).toContain("listChessEmployeeAlerts(selected.id).catch(()=>null)");
  expect(source).toContain("Work items could not be loaded");
  expect(source).toContain("Notifications could not be loaded");
  expect(source).toContain('role="alert"');
  expect(source).not.toContain("listChessWorkItems(selected.id).catch(()=>[])");
 });
 it("does not label unknown calendar sharing consent as Off",()=>{
  const source=read("work-items/page.tsx");
  expect(source).toContain("getMyCalendarPreference().catch(()=>null)");
  expect(source).toContain("Calendar sharing settings could not be verified");
  expect(source).toContain("{calendarPreference?<>");
  expect(source).not.toContain("getMyCalendarPreference().catch(()=>({enabled:false");
 });
 it("remounts all business-scoped interactive work-item areas after unit switch",()=>{
  const source=read("work-items/page.tsx");
  for(const component of ["WorkItemsClient","EmployeeAlerts","ManagerQueueClient",
   "AppointmentsClient","RecurrencesClient"]){
   expect(source).toContain("<"+component+" key={selected.id}");
  }
 });
 it("does not silently substitute a different permitted business for a revoked deep link",()=>{
  for(const page of [
   "work-items/page.tsx","finance-operations/page.tsx","financial-attempts/page.tsx",
   "action-approvals/page.tsx","business-units/page.tsx",
   "service-billing/page.tsx","regulated-services/page.tsx",
  ]){
   const source=read(page);
   expect(source,page).toContain("selectChessWorkspace(");
   expect(source,page).not.toContain("??units[0]");
   expect(source,page).not.toContain("??businesses[0]");
  }
 });
 it("remounts financial and admin forms when navigating between businesses",()=>{
  const files=[
   ["service-billing/page.tsx","RecurringPlansPanel"],
   ["action-approvals/page.tsx","ApprovalClient"],
   ["business-units/page.tsx","BusinessUnitAdmin"],
   ["finance-operations/page.tsx","FinanceBankFeedClient"],
  ] as const;
  for(const [file,component] of files){
   const src=read(file);
   expect(src,file).toMatch(new RegExp("<"+component+" key=\\{selected"));
  }
 });
 it("separates staff from manager shortcuts on the overview and service desk",()=>{
  const overview=read("overview/page.tsx");
  const desk=read("chess-desk/ChessDeskDirectory.tsx");
  expect(overview).toContain("managedUnits.length>0");
  expect(overview).toContain("Business manager tools");
  expect(desk).toContain("managerBusinessId");
  expect(desk).toContain("isBusinessManager&&");
  expect(desk).toContain("isAdministrator&&");
  expect(desk).not.toContain('href="/api/chess/recurrences/run"');
 });
});
