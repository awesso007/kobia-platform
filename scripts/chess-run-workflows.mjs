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
  if(process.env.CHESS_PAYROLL_STATUS_ENABLED==="true"){
   // Read-only vendor status retrieval. Never submits a pay run.
   const payrollUrl=new URL("/api/chess/payroll-status/run",base);
   payrollUrl.searchParams.set("t",slug);
   const payrollResponse=await fetch(payrollUrl,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000),
   });
   if(!payrollResponse.ok)throw new Error(`Payroll status HTTP ${payrollResponse.status}`);
   const payroll=await payrollResponse.json();
   if(payroll.disabled || typeof payroll.unresolved!=="number")
    throw new Error("Payroll status integration is not ready.");
   console.log(`CHESS ${slug}: payroll runs reviewed ${payroll.examined}; status updated ${payroll.updated}; unresolved ${payroll.unresolved}`);
   if(payroll.unresolved>0)failures++;
  }
  if(process.env.CHESS_AUDIT_EXPORT_ENABLED==="true"){
   const archiveUrl=new URL("/api/chess/audit-archive/run",base);
   archiveUrl.searchParams.set("t",slug);
   const response=await fetch(archiveUrl,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000),
   });
   if(!response.ok)throw new Error(`Audit export HTTP ${response.status}`);
   const audit=await response.json();
   if(audit.disabled||typeof audit.unresolved!=="number")
    throw new Error("Audit archive worker is not ready.");
   console.log(`CHESS ${slug}: audit archived ${audit.archived}; unresolved ${audit.unresolved}; blocked ${audit.blocked}`);
   if(audit.unresolved>0||audit.blocked>0)failures++;
  }
  if(process.env.CHESS_AI_TRIAGE_ENABLED==="true"){
   const triageUrl=new URL("/api/chess/ai-triage/run",base);
   triageUrl.searchParams.set("t",slug);
   const aiResponse=await fetch(triageUrl,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Authorization":`Bearer ${token}`,"Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000),
   });
   if(!aiResponse.ok)throw new Error(`AI triage HTTP ${aiResponse.status}`);
   const ai=await aiResponse.json();
   if(ai.disabled||typeof ai.generated!=="number"||
    typeof ai.blocked!=="number")
    throw new Error("AI triage integration is not ready.");
   console.log(`CHESS ${slug}: AI proposals ${ai.generated}; triage failed ${ai.blocked}`);
   if(ai.blocked>0)failures++;
  }
  if(process.env.CHESS_BILLING_RECURRING_DRAFTS_ENABLED==="true"){
   const draftsUrl=new URL("/api/chess/recurring-billing/run",base);
   draftsUrl.searchParams.set("t",slug);
   const response=await fetch(draftsUrl,{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{"Authorization":`Bearer ${token}`,
     "Content-Type":"application/json"},
    body:"{}",signal:AbortSignal.timeout(20000),
   });
   if(!response.ok)throw new Error(`Recurring drafts HTTP ${response.status}`);
   const result=await response.json();
   if(result.disabled||typeof result.created!=="number"||
    typeof result.blocked!=="number"||typeof result.paused!=="number")
    throw new Error("Recurring draft worker did not confirm an approved run.");
   console.log(`CHESS ${slug}: recurring invoice drafts ${result.created}; paused ${result.paused}; blocked ${result.blocked}`);
   if(result.blocked>0)failures++;
  }
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
