// Fail-closed deployment readiness checks. Run in the target environment with
// real secrets injected by the deployment platform (never in source control).
const required=[
 "DATABASE_URL","DIRECT_URL","CHESS_PUBLIC_ORIGIN",
 "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY","CLERK_SECRET_KEY",
 "CHESS_CONSENT_EVIDENCE_KEY","CHESS_DOCUMENT_SCAN_KEY",
 "CHESS_SCAN_WORKER_TOKEN","CHESS_CLAMAV_HOST",
 "KOBIA_S3_BUCKET","KOBIA_S3_REGION",
 "KOBIA_S3_ACCESS_KEY_ID","KOBIA_S3_SECRET_ACCESS_KEY",
 "CHESS_PAYROLL_API_URL","CHESS_PAYROLL_ALLOWED_HOST",
 "CHESS_PAYROLL_API_KEY","CHESS_LICENSE_API_URL",
 "CHESS_LICENSE_ALLOWED_HOST","CHESS_LICENSE_API_KEY",
 "CHESS_LICENSE_SOURCE_HOSTS",
];
const errors=[];
for(const key of required)if(!process.env[key])errors.push(`${key} is missing`);
for(const key of ["CHESS_CONSENT_EVIDENCE_KEY","CHESS_DOCUMENT_SCAN_KEY","CHESS_SCAN_WORKER_TOKEN"]){
 if((process.env[key]??"").length<32)errors.push(`${key} must be at least 32 characters`);
}
for(const prefix of ["CHESS_PAYROLL","CHESS_LICENSE","CHESS_CALENDAR"]){
 const raw=process.env[`${prefix}_API_URL`];
 const allow=process.env[`${prefix}_ALLOWED_HOST`];
 if(raw){
  try{
   const url=new URL(raw);
   if(url.protocol!=="https:" || url.hostname!==allow || url.username || url.password)
    errors.push(`${prefix} URL is not an approved HTTPS endpoint`);
  }catch{errors.push(`${prefix} URL is malformed`);}
 }
}
try{
 const url=new URL(process.env.CHESS_PUBLIC_ORIGIN??"invalid");
 if(url.protocol!=="https:" && process.env.NODE_ENV==="production")
  errors.push("CHESS_PUBLIC_ORIGIN must use HTTPS in production");
}catch{errors.push("CHESS_PUBLIC_ORIGIN must be a valid URL");}
if(process.env.CHESS_PAYROLL_EXECUTION_ENABLED==="true" &&
 process.env.CHESS_PAYROLL_PROVIDER_CERTIFIED!=="true"){
 errors.push("Payroll execution enabled without verified provider compliance gate");
}
if(process.env.CHESS_SCHEDULER_ENABLED==="true"){
 if((process.env.CHESS_WORKFLOW_WORKER_TOKEN??"").length<32)
  errors.push("CHESS_WORKFLOW_WORKER_TOKEN must be at least 32 characters");
 const slugs=(process.env.CHESS_ACTIVE_TENANT_SLUGS??"").split(",").map(s=>s.trim()).filter(Boolean);
 if(slugs.length===0||slugs.length>50||slugs.some(s=>
  !/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(s)))
  errors.push("CHESS_ACTIVE_TENANT_SLUGS requires 1-50 valid tenant slugs");
}
if(process.env.CHESS_CALENDAR_SYNC_ENABLED==="true"){
 for(const key of ["CHESS_CALENDAR_API_URL","CHESS_CALENDAR_CANCEL_API_URL",
  "CHESS_CALENDAR_ALLOWED_HOST","CHESS_CALENDAR_API_KEY"]){
  if(!process.env[key])errors.push(`${key} is required for calendar sync`);
 }
 if(process.env.CHESS_SCHEDULER_ENABLED!=="true")
  errors.push("Calendar sync requires approved CHESS_SCHEDULER_ENABLED=true");
}
if(process.env.NODE_ENV!=="production")errors.push("NODE_ENV must be production");
if(errors.length){
 for(const error of errors)console.error("RELEASE BLOCKED:",error);
 process.exitCode=1;
}else console.log("CHESS deployment configuration preflight PASS (connectivity/compliance still require checks).");
