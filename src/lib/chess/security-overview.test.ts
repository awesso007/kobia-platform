import {describe,expect,it} from "vitest";
import {mayReadChessSecurityOverview} from "./security-overview";
import {incidentSignalCodes} from "./incident-monitor";
describe("tenant security-oversight employee screen",()=>{
 it("requires an active owner or administrator, never a generic CRM staff role",()=>{
  expect(mayReadChessSecurityOverview("OWNER","ACTIVE")).toBe(true);
  expect(mayReadChessSecurityOverview("ADMIN","ACTIVE")).toBe(true);
  for(const role of ["MEMBER","VIEWER","MANAGER"]){
   expect(mayReadChessSecurityOverview(role,"ACTIVE")).toBe(false);
  }
  expect(mayReadChessSecurityOverview("OWNER","SUSPENDED")).toBe(false);
 });
 it("detects unresolved archive and consent-calendar failures even without paging",()=>{
  expect(incidentSignalCodes({
   schedulerLastSeenAt:new Date("2026-11-11T12:05:00Z"),
   latestWorkerStatus:"SUCCESS",overdueSchedules:0,
   archiveUnknown:1,archiveRejected:0,archiveOldPending:0,
   calendarOldPending:30,
  },new Date("2026-11-11T12:15:00Z"))).toEqual([
   "AUDIT_ARCHIVE_UNDELIVERED","CONSENT_CALENDAR_BACKLOG",
  ]);
 });
});
