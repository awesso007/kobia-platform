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
  lastInspectedAt:null as Date|null,
 }));
 let queries=0;
 const visited=new Set<string>();
 const eligible=(excluded:string[]=[])=>{
  const ids=new Set(excluded);
  return due.filter(row=>!ids.has(row.id))
   .sort((a,b)=>{
    if(a.lastInspectedAt===null&&b.lastInspectedAt!==null)return -1;
    if(b.lastInspectedAt===null&&a.lastInspectedAt!==null)return 1;
    const time=(a.lastInspectedAt?.getTime()??0)-
      (b.lastInspectedAt?.getTime()??0);
    return time||a.id.localeCompare(b.id);
   });
 };
 const db={
  chessBillingSubscriptionPlan:{
   findMany:async(query:{where:{id?:{notIn?:string[]}};take:number;
    orderBy:unknown})=>{
    queries++;
    const rows=eligible(query.where.id?.notIn).slice(0,query.take);
    rows.forEach(row=>visited.add(row.id));
    return rows.map(row=>({...row,nextDraftAt:new Date("2026-11-01")}));
   },
   findFirst:async(query:{where:{id?:{notIn?:string[]}}})=>
    eligible(query.where.id?.notIn)[0]??null,
   updateMany:async(query:{where:{id:string};data:{lastInspectedAt:Date}})=>{
    const row=due.find(x=>x.id===query.where.id);
    if(row)row.lastInspectedAt=query.data.lastInspectedAt;
    return {count:row?1:0};
   },
  },
  $transaction:async()=>{throw new Error("Fictional current consent denied");},
 };
 vi.mocked(getTenantDb).mockReturnValue({db,tenantId:"fictional"} as never);
 return {queries:()=>queries,visited:()=>visited.size};
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
  const second=await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:01:00Z"));
  expect(second).toMatchObject({examined:500,blocked:500,backlog:true});
  expect(state.visited()).toBe(550); // all 550 had a fair attempt by run two
 });
 it("does not report a false backlog when exactly 500 due plans were examined",async()=>{
  enabled();
  fakeDb(500);
  const result=await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:00:00Z"));
  expect(result).toMatchObject({examined:500,blocked:500,backlog:false});
 });
 it("does not reach the database without independently active billing and scheduler policy",async()=>{
  fakeDb(1);
  const response=await runChessRecurringInvoiceDrafts(new Date("2026-12-01T00:00:00Z"));
  expect(response).toEqual({disabled:true,examined:0,created:0,
   blocked:0,paused:0,backlog:false});
 });
});
