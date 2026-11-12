import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import {PrismaClient} from "@/lib/db/generated/tenant";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {runDueChessRecurrences} from "./recurring-work";

vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));

const integration=process.env.RUN_CHESS_DB_INTEGRATION==="1"?describe:describe.skip;

integration("M4 recurring scheduler fairness in disposable PostgreSQL",()=>{
 let db:PrismaClient;
 const suffix=Date.now().toString(36);
 const invalidBusinessId="fictional-recurrence-invalid-"+suffix;
 const now=new Date("2020-01-15T12:00:00.000Z");
 beforeAll(async()=>{
  db=new PrismaClient();
  await db.$connect();
  vi.mocked(getTenantDb).mockReturnValue({
   db,tenantId:"fictional-integration",
  } as never);
 });
 afterAll(async()=>{
  if(db){
   await db.chessWorkRecurrence.deleteMany({where:{businessId:invalidBusinessId}});
   await db.$disconnect();
  }
  vi.clearAllMocks();
 });
 it("inspects every due blocked template fairly over multiple invocations",async()=>{
  await db.chessWorkRecurrence.createMany({
   data:Array.from({length:55},(_,i)=>({
    businessId:invalidBusinessId,
    title:"Fictional blocked recurrence "+i,
    createdByClerkUserId:"fictional-worker-test",
    frequency:"DAILY" as const,
    interval:1,
    anchorDay:14,
    nextRunAt:new Date("2020-01-14T12:00:00.000Z"),
   })),
  });
  const first=await runDueChessRecurrences(now);
  expect(first).toEqual({examined:25,generated:0,blocked:25,backlog:true});
  const afterFirst=await db.chessWorkRecurrence.count({
   where:{businessId:invalidBusinessId,lastInspectedAt:{not:null}},
  });
  expect(afterFirst).toBe(25);
  const second=await runDueChessRecurrences(new Date(now.getTime()+60000));
  expect(second).toEqual({examined:25,generated:0,blocked:25,backlog:true});
  const afterSecond=await db.chessWorkRecurrence.count({
   where:{businessId:invalidBusinessId,lastInspectedAt:{not:null}},
  });
  expect(afterSecond).toBe(50);
  const third=await runDueChessRecurrences(new Date(now.getTime()+120000));
  expect(third.examined).toBe(25);
  expect(third.backlog).toBe(true);
  const inspected=await db.chessWorkRecurrence.findMany({
   where:{businessId:invalidBusinessId},
   select:{lastInspectedAt:true,lastRunAt:true,nextRunAt:true},
  });
  expect(inspected).toHaveLength(55);
  expect(inspected.every(row=>row.lastInspectedAt!==null)).toBe(true);
  expect(inspected.every(row=>row.lastRunAt===null)).toBe(true);
  expect(inspected.every(row=>row.nextRunAt.getTime()===
   new Date("2020-01-14T12:00:00.000Z").getTime())).toBe(true);
  // A failed or unavailable business must not create a task or imply success.
  expect(await db.chessWorkItem.count({
   where:{businessId:invalidBusinessId},
  })).toBe(0);
 });
});
