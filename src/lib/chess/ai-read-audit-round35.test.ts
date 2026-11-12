import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {getChessAiDailyUsage,getChessAiWorkerSnapshot} from "./ai-daily-budget";
import {listChessWorkItemTriage} from "./ai-triage";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("./business-manager",()=>({assertBusinessManager:vi.fn()}));

type Role="OWNER"|"ADMIN"|"MEMBER";
function setup(role:Role="OWNER",status="ACTIVE",business="ACTIVE"){
 const events:Array<{data:{action:string;decision:string;resourceId:string}} >=[];
 const findMany=vi.fn(async()=>[{
  id:"advice-1",workItemId:"work-1",priority:"HIGH",
  recommendation:"ESCALATE_TO_MANAGER",rationaleCode:"OVERDUE",
  modelVersion:"test",status:"PENDING",createdAt:new Date(),
  updatedAt:new Date(),appliedAt:null,followupWorkItemId:null,
  requestedByClerkUserId:"author",reviewedByClerkUserId:null,
 }]);
 const tx={
  membership:{findUnique:vi.fn(async()=>({status,role}))},
  chessBusinessUnit:{findUnique:vi.fn(async()=>({status:business}))},
  chessEmployeeAssignment:{findUnique:vi.fn(async()=>({
   role:"MANAGER",revokedAt:null,
  }))},
  chessAiSuggestion:{findMany},
  chessAiUsageDaily:{findUnique:vi.fn(async()=>({callCount:3}))},
  chessWorkerRun:{findFirst:vi.fn(async()=>null)},
  chessSecurityEvent:{create:vi.fn(async(x:{data:{action:string;decision:string;resourceId:string}})=>{
   events.push(x);return {id:"audit-1"};
  })},
 };
 const db={$transaction:vi.fn(async(
  run:(tx:typeof tx)=>Promise<unknown>,_options:unknown,
 )=>run(tx))};
 vi.mocked(getTenantDb).mockReturnValue({db} as never);
 vi.mocked(assertBusinessManager).mockResolvedValue({
  clerkUserId:"current-user",role:"OWNER",status:"ACTIVE",
 } as never);
 return {tx,db,events,findMany};
}
beforeEach(()=>vi.clearAllMocks());

describe("Round 35 M7/M8 sensitive AI read auditing",()=>{
 it("records an ALLOW for an empty-but-authorized worker history",async()=>{
  const {events,db,tx}=setup();
  const result=await getChessAiWorkerSnapshot("unit-1");
  expect(result).toEqual({latest:null});
  expect(events.map(x=>x.data)).toEqual([expect.objectContaining({
   action:"AI_WORKER_READ",decision:"ALLOW",
  })]);
  expect(tx.chessWorkerRun.findFirst).toHaveBeenCalledTimes(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
   {isolationLevel:"Serializable"});
 });
 it("records a DENY before a role-downgraded worker or budget read",async()=>{
  for(const [status,role] of [
   ["SUSPENDED","OWNER"],["ACTIVE","MEMBER"],
  ] as const){
   vi.clearAllMocks();
   const {tx,events}=setup(role,status);
   await expect(getChessAiWorkerSnapshot("unit-1")).rejects.toThrow();
   await expect(getChessAiDailyUsage("unit-1")).rejects.toThrow();
   expect(tx.chessWorkerRun.findFirst).not.toHaveBeenCalled();
   expect(tx.chessAiUsageDaily.findUnique).not.toHaveBeenCalled();
   expect(events.map(e=>e.data.decision)).toEqual(["DENY","DENY"]);
  }
 });
 it("does not release AI usage when audit storage is down",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("Audit storage down"));
  await expect(getChessAiDailyUsage("unit-1")).rejects.toThrow("Audit storage down");
  expect(tx.chessAiUsageDaily.findUnique).toHaveBeenCalled();
 });
 it("reads budget only in authorized snapshot and logs no cost or identity details",async()=>{
  const {tx,events}=setup();
  const result=await getChessAiDailyUsage("unit-1");
  expect(result.reservedCalls).toBe(3);
  expect(result.maxCalls).toBeGreaterThan(0);
  expect(tx.chessAiUsageDaily.findUnique).toHaveBeenCalledTimes(1);
  expect(events[0]?.data).toMatchObject({
   action:"AI_BUDGET_READ",resourceId:"business:unit-1",decision:"ALLOW",
  });
  expect(JSON.stringify(events)).not.toContain("5000");
 });
 it("denies a business-manager losing its assignment before the AI suggestion SELECT",async()=>{
  const {tx,events,findMany}=setup("MEMBER");
  tx.chessEmployeeAssignment.findUnique.mockResolvedValueOnce({
   role:"SUPPORT",revokedAt:null,
  });
  await expect(listChessWorkItemTriage("unit-1")).rejects.toThrow();
  expect(findMany).not.toHaveBeenCalled();
  expect(events[0]?.data.decision).toBe("DENY");
 });
 it("recalculates the suggestion reviewer role from the audited transaction",async()=>{
  const {events,findMany}=setup("MEMBER");
  const result=await listChessWorkItemTriage("unit-1");
  expect(result).toHaveLength(1);
  expect(result[0]?.mayReview).toBe(false);
  expect(result[0]?.mayApply).toBe(false);
  expect(findMany).toHaveBeenCalledTimes(1);
  expect(events.map(e=>e.data)).toEqual([expect.objectContaining({
   action:"AI_TRIAGE_DIRECTORY_READ",decision:"ALLOW",
  })]);
 });
 it("makes suggestion read fail if append-only audit insertion fails",async()=>{
  const {tx}=setup();
  tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("Audit rejected"));
  await expect(listChessWorkItemTriage("unit-1")).rejects.toThrow("Audit rejected");
 });
});
