import {beforeEach,describe,expect,it,vi} from "vitest";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getChessAuditArchiveHealth} from "./audit-archive";
import {getChessWorkerHealth} from "./worker-health";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error {},
}));
vi.mock("./audit-archive",()=>({getChessAuditArchiveHealth:vi.fn()}));

const now=new Date("2026-11-11T12:00:00.000Z");
function setup(status="ACTIVE",role="OWNER"){
 const events:unknown[]=[];
 const tx={
  membership:{findUnique:vi.fn(async()=>({status,role}))},
  chessWorkerRun:{findMany:vi.fn(async()=>[{
   kind:"RECURRING_WORK",status:"SUCCESS",
   examined:2,processed:2,blocked:0,
   occurredAt:new Date("2026-11-11T11:50:00.000Z"),
  }])},
  chessWorkRecurrence:{count:vi.fn(async()=>1)},
  chessCalendarOutbox:{count:vi.fn(async()=>3)},
  chessAppointmentCalendarOutbox:{count:vi.fn(async()=>5)},
  chessSecurityEvent:{create:vi.fn(async (entry:{data:unknown})=>{
   events.push(entry.data);
   return {id:"audit-worker-health"};
  })},
 };
 const db={$transaction:vi.fn(async(
  callback:(client:typeof tx)=>Promise<unknown>,
  _options:unknown,
 )=>callback(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(getCurrentMembership).mockResolvedValue({
  clerkUserId:"current-owner",status:"ACTIVE",role:"OWNER",
 } as never);
 vi.mocked(getChessAuditArchiveHealth).mockResolvedValue({
  configured:false,pending:0,unknown:0,archived:0,rejected:0,
  unqueued:0,healthy:true,
 });
 return {events,tx,db};
}
beforeEach(()=>vi.clearAllMocks());

describe("Round 32 M8 worker and audit health access",()=>{
 it("returns metrics only after snapshot-based current-owner check and auditable ALLOW",async()=>{
  const {tx,events,db}=setup();
  const data=await getChessWorkerHealth(now);
  expect(data.calendarPending).toBe(3);
  expect(data.appointmentCalendarPending).toBe(5);
  expect(data.schedulerStale).toBe(false);
  expect(data.auditArchive.healthy).toBe(true);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
  expect(getChessAuditArchiveHealth).toHaveBeenCalledWith(tx);
  expect(events).toEqual([{
   actorClerkUserId:"current-owner",action:"WORKER_HEALTH_READ",
   resourceType:"ChessWorkerRun",resourceId:"TENANT_WORKERS",
   decision:"ALLOW",
  }]);
 });
 it("denies newly revoked, suspended or downgraded role before reading any metrics",async()=>{
  for(const [status,role] of [
   ["SUSPENDED","OWNER"],["ACTIVE","MEMBER"],
   ["ACTIVE","VIEWER"],
  ]){
   vi.clearAllMocks();
   const {tx,events}=setup(status,role);
   await expect(getChessWorkerHealth(now)).rejects.toThrow();
   expect(tx.chessWorkerRun.findMany).not.toHaveBeenCalled();
   expect(tx.chessWorkRecurrence.count).not.toHaveBeenCalled();
   expect(getChessAuditArchiveHealth).not.toHaveBeenCalled();
   expect(events).toEqual([expect.objectContaining({
    action:"WORKER_HEALTH_READ",decision:"DENY",
   })]);
  }
 });
 it("fails closed on archive-health read or audit write failure",async()=>{
  const {tx}=setup();
  vi.mocked(getChessAuditArchiveHealth).mockRejectedValueOnce(
   new Error("Archive status unavailable"),
  );
  await expect(getChessWorkerHealth(now))
   .rejects.toThrow("Archive status unavailable");
  expect(tx.chessSecurityEvent.create).not.toHaveBeenCalled();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("Audit denied"));
  await expect(getChessWorkerHealth(now)).rejects.toThrow("Audit denied");
 });
});
