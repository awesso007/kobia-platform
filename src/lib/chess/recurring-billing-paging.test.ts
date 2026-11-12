import {afterEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {runChessRecurringInvoiceDrafts} from "./recurring-billing";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});

function enabled(){
 vi.stubEnv("CHESS_BILLING_RECURRING_DRAFTS_ENABLED","true");
 vi.stubEnv("CHESS_BILLING_RECURRING_POLICY_APPROVED","true");
 vi.stubEnv("CHESS_SCHEDULER_ENABLED","true");
}
function fakeDb(size:number){
 const due=Array.from({length:size},(_,i)=>({
  id:"fictional-plan-"+String(i).padStart(5,"0"),
 }));
 let queries=0;
 const db={
  chessBillingSubscriptionPlan:{
   findMany:async(query:{where:{id?:{notIn?:string[]}};take:number})=>{
    queries++;
    const excluded=new Set(query.where.id?.notIn??[]);
    return due.filter(row=>!excluded.has(row.id)).slice(0,query.take);
   },
  },
  $transaction:async()=>{throw new Error("Fictional current consent denied");},
 };
 vi.mocked(getTenantDb).mockReturnValue({db,tenantId:"fictional"} as never);
 return {queries:()=>queries};
}
describe("M7 bounded recurring draft worker in denial and overflow conditions",()=>{
 it("visits every eligible plan once across several batches, including denied plans",async()=>{
  enabled();
  const state=fakeDb(45);
  expect(await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:00:00Z")))
   .toEqual({disabled:false,examined:45,created:0,blocked:45,paused:0,
    backlog:false});
  expect(state.queries()).toBe(3);
 });
 it("surfaces a 500-plan cap as backlog instead of claiming the queue is drained",async()=>{
  enabled();
  const state=fakeDb(550);
  expect(await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:00:00Z")))
   .toEqual({disabled:false,examined:500,created:0,blocked:500,paused:0,
    backlog:true});
  expect(state.queries()).toBe(25);
 });
 it("does not reach the database without independently active billing and scheduler policy",async()=>{
  fakeDb(1);
  const response=await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:00:00Z"));
  expect(response).toEqual({disabled:true,examined:0,created:0,
   blocked:0,paused:0,backlog:false});
 });
});
