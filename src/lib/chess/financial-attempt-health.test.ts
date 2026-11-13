import {beforeEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {financialAttemptCounts,getChessFinancialAttemptHealth} from "./financial-attempt-health";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("./business-manager",()=>({assertBusinessManager:vi.fn()}));
beforeEach(()=>vi.clearAllMocks());

describe("M5 manager-only financial attempt status monitor",()=>{
 it("counts all six durable states without misrepresenting committed as settled",()=>{
  expect(financialAttemptCounts([
   {status:"UNKNOWN",_count:{_all:2}},
   {status:"COMMITTED",_count:{_all:4}},
  ])).toEqual({RESERVED:0,EXECUTING:0,UNKNOWN:2,
   COMMITTED:4,FAILED:0,CANCELLED:0});
 });
 function mock(role:"OWNER"|"MEMBER",assignment:"MANAGER"|"SUPPORT",revoked=false){
  const events:unknown[]=[];let selects=0;
  const date=new Date("2026-11-11T00:00:00.000Z");
  const tx={
   membership:{findUnique:async()=>({status:"ACTIVE",role})},
   chessBusinessUnit:{findUnique:async()=>({status:"ACTIVE"})},
   chessEmployeeAssignment:{findUnique:async()=>({
    role:assignment,revokedAt:revoked?date:null,
   })},
   chessFinancialAttempt:{
    groupBy:async()=>{selects++;return [{status:"UNKNOWN",_count:{_all:2}}];},
    findFirst:async()=>{selects++;return {reservedAt:date};},
    findMany:async()=>{selects++;return [{status:"UNKNOWN",reservedAt:date,updatedAt:date}];},
   },
   chessSecurityEvent:{create:async(input:unknown)=>{events.push(input);}},
  };
  const db={$transaction:async(cb:(data:typeof tx)=>Promise<unknown>)=>cb(tx)};
  vi.mocked(getTenantDb).mockReturnValue({db} as never);
  vi.mocked(assertBusinessManager).mockResolvedValue({
   clerkUserId:"fictional-actor",status:"ACTIVE",role,
  } as never);
  return {events,selects:()=>selects};
 }
 it("returns redacted business-only states after a committed allow audit",async()=>{
  const state=mock("MEMBER","MANAGER");
  const result=await getChessFinancialAttemptHealth("unit-one");
  expect(result.counts.UNKNOWN).toBe(2);
  expect(result.oldestUnconfirmedAt?.toISOString()).toContain("2026-11-11");
  expect(Object.keys(result.recent[0]??{}).sort())
   .toEqual(["reservedAt","status","updatedAt"]);
  expect(state.selects()).toBe(3);
  expect(state.events).toEqual([{data:{
   businessId:"unit-one",actorClerkUserId:"fictional-actor",
   action:"FINANCIAL_ATTEMPT_HEALTH_READ",
   resourceType:"ChessFinancialAttempt",resourceId:"business:unit-one",
   decision:"ALLOW",
  }}]);
 });
 it("never queries attempt rows for revoked or unsupported managers",async()=>{
  for(const [assignment,revoked] of [
   ["SUPPORT",false],["MANAGER",true],
  ] as const){
   const state=mock("MEMBER",assignment,revoked);
   await expect(getChessFinancialAttemptHealth("unit-one")).rejects.toThrow();
   expect(state.selects()).toBe(0);
   expect(state.events).toEqual([{data:expect.objectContaining({decision:"DENY"})}]);
  }
 });
});
