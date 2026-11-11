/**
 * CHESS recurring-work scheduler. Run from an approved server-side cron runner.
 * The production deployment must supply CHESS_PUBLIC_ORIGIN,
 * CHESS_WORKFLOW_WORKER_TOKEN and CHESS_ACTIVE_TENANT_SLUGS.
 * Does not require employee passwords or bypass application tenant isolation.
 */
const origin=process.env.CHESS_PUBLIC_ORIGIN;
const token=process.env.CHESS_WORKFLOW_WORKER_TOKEN;
const rawSlugs=process.env.CHESS_ACTIVE_TENANT_SLUGS??"";
const enabled=process.env.CHESS_SCHEDULER_ENABLED==="true";
const slugs=[...new Set(rawSlugs.split(",").map(s=>s.trim()).filter(Boolean))];
const slugRe=/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
if(!enabled)throw new Error("Recurring work scheduler disabled.");
if(!origin||!token||token.length<32||slugs.length===0||slugs.length>50||
 slugs.some(s=>!slugRe.test(s)))throw new Error("Scheduler environment is incomplete.");
const base=new URL(origin);
if(base.protocol!=="https:"||base.username||base.password||base.pathname!=="/"||
 base.search||base.hash)throw new Error("Scheduler requires an exact HTTPS origin.");
let failures=0;
for(const slug of slugs){
 const url=new URL("/api/chess/recurrences/run",base);
 url.searchParams.set("t",slug);
 try{
  const response=await fetch(url,{method:"POST",redirect:"error",cache:"no-store",
   headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
   body:"{}",signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const result=await response.json();
  if(typeof result.generated!=="number"||typeof result.blocked!=="number"||
   typeof result.examined!=="number")throw new Error("Invalid worker response.");
  console.log(`CHESS ${slug}: examined ${result.examined}; created ${result.generated}; blocked ${result.blocked}`);
  if(result.blocked>0)failures++;
  if(process.env.CHESS_CALENDAR_SYNC_ENABLED==="true"){
   const calendarUrl=new URL("/api/chess/calendar-sync/run",base);
   calendarUrl.searchParams.set("t",slug);
   const response=await fetch(calendarUrl,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000),
   });
   if(!response.ok)throw new Error(`Calendar gateway HTTP ${response.status}`);
   const calendar=await response.json();
   if(calendar.disabled || typeof calendar.unknown!=="number")
    throw new Error("Calendar synchronization has not been configured.");
   console.log(`CHESS ${slug}: calendar synced ${calendar.synced}; cancelled ${calendar.cancelled}; unknown ${calendar.unknown}; cancellation unknown ${calendar.cancelUnknown}`);
   if(calendar.unknown>0||calendar.cancelUnknown>0||calendar.reconciliationUnresolved>0)failures++;
  }
 }catch(error){
  failures++;
  console.error(`CHESS ${slug}: scheduler failed`,error instanceof Error?error.message:String(error));
 }
}
if(failures>0)process.exitCode=1;
