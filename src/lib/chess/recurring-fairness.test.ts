import {afterEach,describe,expect,it,vi} from "vitest";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {runDueChessRecurrences} from "./recurring-work";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
afterEach(()=>{vi.clearAllMocks();});

const due=new Date("2026-10-15T00:00:00.000Z");
const now=new Date("2026-10-16T12:00:00.000Z");

function fakeDb(count:number,businessExists=false){
 const rows=Array.from({length:count},(_,i)=>({
  id:"fictional-recurrence-"+String(i).padStart(4,"0"),
  businessId:"fictional-business",clientProfileId:null,
  title:"Fictional review",assignedClerkUserId:null,
  frequency:"DAILY",interval:1,anchorDay:15,
  nextRunAt:new Date(due),lastRunAt:null as Date|null,
  lastInspectedAt:null as Date|null,active:true,
 }));
 const seen=new Set<string>();
 const tasks:string[]=[];
 const table={
  findMany:async ({take}:{take:number})=>rows.filter(row=>
   row.active&&row.nextRunAt<=now).sort((a,b)=>{
    if(a.lastInspectedAt===null&&b.lastInspectedAt!==null)return -1;
    if(b.lastInspectedAt===null&&a.lastInspectedAt!==null)return 1;
    return (a.lastInspectedAt?.getTime()??0)-
     (b.lastInspectedAt?.getTime()??0)||
     a.nextRunAt.getTime()-b.nextRunAt.getTime()||
     a.id.localeCompare(b.id);
   }).slice(0,take).map(row=>({...row})),
  updateMany:async ({where,data}:{where:{
   id:string;active:boolean;nextRunAt:Date;lastInspectedAt?:Date|null};
   data:{lastInspectedAt?:Date;nextRunAt?:Date;lastRunAt?:Date}})=>{
   const row=rows.find(row=>row.id===where.id&&row.active===where.active&&
    row.nextRunAt.getTime()===where.nextRunAt.getTime()&&
    (where.lastInspectedAt===undefined||
     row.lastInspectedAt?.getTime()===where.lastInspectedAt?.getTime()));
   if(!row)return {count:0};
   if(data.lastInspectedAt) {row.lastInspectedAt=data.lastInspectedAt;seen.add(row.id);}
   if(data.nextRunAt)row.nextRunAt=data.nextRunAt;
   if(data.lastRunAt)row.lastRunAt=data.lastRunAt;
   return {count:1};
  },
 };
 const tx={
  chessWorkRecurrence:table,
  chessBusinessUnit:{findUnique:async()=>businessExists?{status:"ACTIVE"}:null},
  chessWorkItem:{create:async({data}:{data:{recurrenceId:string}})=>{
   tasks.push(data.recurrenceId);return {id:"task-"+data.recurrenceId};
  }},
  chessSecurityEvent:{create:async()=>({id:"fictional-audit"})},
 };
 vi.mocked(getTenantDb).mockReturnValue({
  db:{...tx,$transaction:async(callback:(trx:typeof tx)=>Promise<unknown>)=>callback(tx)},
 } as never);
 return {rows,seen,tasks};
}

describe("M4 bounded recurring scheduler fairness",()=>{
 it("rotates blocked templates rather than starving later due work",async()=>{
  const state=fakeDb(60);
  const first=await runDueChessRecurrences(now);
  expect(first).toEqual({examined:25,generated:0,blocked:25,backlog:true});
  expect(state.seen.size).toBe(25);
  const second=await runDueChessRecurrences(new Date(now.getTime()+60000));
  expect(second).toEqual({examined:25,generated:0,blocked:25,backlog:true});
  expect(state.seen.size).toBe(50);
  const third=await runDueChessRecurrences(new Date(now.getTime()+120000));
  expect(third).toMatchObject({examined:25,generated:0,backlog:true});
  expect(state.seen.size).toBe(60);
  expect(state.tasks).toHaveLength(0);
 });
 it("does not misreport a backlog when exactly 25 templates are due",async()=>{
  const state=fakeDb(25);
  expect(await runDueChessRecurrences(now)).toEqual({
   examined:25,generated:0,blocked:25,backlog:false,
  });
  expect(state.seen.size).toBe(25);
 });
 it("generates an in-tenant task on an active valid template only",async()=>{
  const state=fakeDb(1,true);
  expect(await runDueChessRecurrences(now)).toEqual({
   examined:1,generated:1,blocked:0,backlog:false,
  });
  expect(state.tasks).toEqual([state.rows[0]!.id]);
  expect(state.rows[0]!.lastRunAt?.getTime()).toBe(due.getTime());
  expect(state.rows[0]!.nextRunAt.getTime()).toBeGreaterThan(due.getTime());
 });
});
