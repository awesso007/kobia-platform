import {describe,it,expect} from "vitest";
import {incidentMonitorAuthorized,incidentSignalCodes} from "./incident-monitor";
describe("M8 privacy-reduced read-only monitor",()=>{
 const config={CHESS_INCIDENT_MONITOR_ENABLED:"true",
  CHESS_INCIDENT_MONITOR_TOKEN:"n".repeat(48)};
 it("requires independent lengthy token and explicit enabled flag",()=>{
  expect(incidentMonitorAuthorized("Bearer "+"n".repeat(48),config)).toBe(true);
  expect(incidentMonitorAuthorized(null,config)).toBe(false);
  expect(incidentMonitorAuthorized("Bearer "+"x".repeat(48),config)).toBe(false);
  expect(incidentMonitorAuthorized("Bearer "+"n".repeat(48),{
   ...config,CHESS_INCIDENT_MONITOR_ENABLED:"false"})).toBe(false);
 });
 it("never claims healthy when archive failed or worker has not reported",()=>{
  const now=new Date("2026-11-11T14:00:00Z");
  const base={schedulerLastSeenAt:now,latestWorkerStatus:"SUCCESS",
   overdueSchedules:0,archiveUnknown:0,archiveRejected:0,
   archiveOldPending:0,calendarOldPending:0};
  expect(incidentSignalCodes(base,now)).toEqual([]);
  expect(incidentSignalCodes({...base,schedulerLastSeenAt:null},now))
   .toContain("SCHEDULER_STALE");
  expect(incidentSignalCodes({...base,archiveUnknown:1},now))
   .toContain("AUDIT_ARCHIVE_UNDELIVERED");
  expect(incidentSignalCodes({...base,latestWorkerStatus:"FAILED"},now))
   .toContain("WORKER_FAILED");
  expect(incidentSignalCodes({...base,calendarOldPending:26},now))
   .toContain("CONSENT_CALENDAR_BACKLOG");
 });
});
