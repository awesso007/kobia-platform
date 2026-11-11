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
// M6 regulatory services fail closed unless independently contracted sources
// and a partner coordination gateway have both been authorized.
if(process.env.CHESS_AFFILIATION_VERIFICATION_ENABLED==="true"){
 for(const key of ["CHESS_AFFILIATION_API_URL",
  "CHESS_AFFILIATION_ALLOWED_HOST","CHESS_AFFILIATION_API_KEY",
  "CHESS_AFFILIATION_SOURCE_HOSTS"]){
  if(!process.env[key])errors.push(`${key} is required for affiliation verification`);
 }
 const raw=process.env.CHESS_AFFILIATION_API_URL;
 if(raw)try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!==process.env.CHESS_AFFILIATION_ALLOWED_HOST||
   url.username||url.password||url.hash)
   errors.push("Affiliation registry must use exact allowed HTTPS host");
 }catch{errors.push("Affiliation registry URL is malformed");}
}
if(process.env.CHESS_REGULATED_HANDOFF_ENABLED==="true"){
 if(process.env.CHESS_REGULATED_RESPONSE_BINDING_REQUIRED!=="true")
  errors.push("Licensed handoff requires provider-echoed service, partner and workflow binding");
 for(const key of ["CHESS_REGULATED_HANDOFF_API_URL",
  "CHESS_REGULATED_STATUS_API_URL","CHESS_REGULATED_ALLOWED_HOST",
  "CHESS_REGULATED_PARTNER_MORTGAGE",
  "CHESS_REGULATED_PARTNER_INSURANCE","CHESS_REGULATED_PARTNER_REAL_ESTATE",
  "CHESS_REGULATED_PARTNER_INVESTMENTS",
  "CHESS_REGULATED_PARTNER_MORTGAGE_API_KEY",
  "CHESS_REGULATED_PARTNER_INSURANCE_API_KEY",
  "CHESS_REGULATED_PARTNER_REAL_ESTATE_API_KEY",
  "CHESS_REGULATED_PARTNER_INVESTMENTS_API_KEY"]){
  if(!process.env[key])errors.push(`${key} is required for regulated partner handoff`);
 }
 if(process.env.CHESS_AFFILIATION_VERIFICATION_ENABLED!=="true")
  errors.push("Regulated handoffs require independently verified firm affiliations");
 for(const name of ["CHESS_REGULATED_HANDOFF_API_URL","CHESS_REGULATED_STATUS_API_URL"]){
  const raw=process.env[name];
  if(raw)try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||url.hostname!==process.env.CHESS_REGULATED_ALLOWED_HOST||
    url.username||url.password||url.hash)
    errors.push(`${name} must match the exact approved HTTPS host`);
  }catch{errors.push(`${name} has an invalid URL`);}
 }
 if(!process.env.CHESS_LICENSE_SOURCE_HOSTS||
    !process.env.CHESS_AFFILIATION_SOURCE_HOSTS)
  errors.push("Regulated handoffs require approved official registry source host allowlists");
}
if(process.env.CHESS_DOCUMENT_LIFECYCLE_ENABLED==="true"&&
 process.env.CHESS_DOCUMENT_RETENTION_POLICY_APPROVED!=="true")
 errors.push("Document lifecycle cannot activate without approved legal hold/retention policy");
if(process.env.CHESS_CALENDAR_OAUTH_ENABLED==="true"){
 if(process.env.CHESS_CALENDAR_OAUTH_PROVIDER_CERTIFIED!=="true")
  errors.push("Employee OAuth requires separately certified gateway with OAuth PKCE, one-time nonce and revocation");
 for(const key of ["CHESS_CALENDAR_OAUTH_START_URL",
  "CHESS_CALENDAR_OAUTH_STATUS_URL","CHESS_CALENDAR_OAUTH_REVOKE_URL",
  "CHESS_CALENDAR_OAUTH_ALLOWED_HOST","CHESS_CALENDAR_OAUTH_API_KEY"])
  if(!process.env[key])errors.push(`${key} missing for employee delegated OAuth`);
 for(const key of ["CHESS_CALENDAR_OAUTH_START_URL",
  "CHESS_CALENDAR_OAUTH_STATUS_URL","CHESS_CALENDAR_OAUTH_REVOKE_URL"]){
  const raw=process.env[key];
  if(raw)try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||
    url.hostname!==process.env.CHESS_CALENDAR_OAUTH_ALLOWED_HOST||
    url.username||url.password||url.hash||url.port)
    errors.push(`${key} is not an approved HTTPS gateway URL`);
  }catch{errors.push(`${key} is malformed`);}
 }
}
if(process.env.CHESS_BANK_FEED_PAGINATION_ENABLED==="true"&&
 (process.env.CHESS_BANK_FEED_ENABLED!=="true"||
  process.env.CHESS_BANK_FEED_IMPORT_ENABLED!=="true"))
 errors.push("Bank feed pagination requires the separately approved and enabled import gateway");
// M8 exported security events require a separate approved append-only archive.
// Enabling export without its restricted retention policy is a release blocker.
// Consent portal is off until legal disclosure text and external
// identity verification policies are separately signed off.
if(process.env.CHESS_CLIENT_CONSENT_PORTAL_ENABLED==="true"){
 if(process.env.CHESS_CLIENT_PORTAL_POLICY_APPROVED!=="true")
  errors.push("Client consent portal requires independently approved disclosure and withdrawal policy");
 if(process.env.CHESS_CLIENT_PORTAL_IDENTITY_APPROVED!=="true")
  errors.push("Client consent portal requires verified Clerk client identity and tenant selection review");
}
if(process.env.CHESS_AUDIT_EXPORT_ENABLED==="true"){
 for(const name of ["CHESS_AUDIT_ARCHIVE_URL","CHESS_AUDIT_STATUS_URL",
  "CHESS_AUDIT_ALLOWED_HOST","CHESS_AUDIT_ARCHIVE_API_KEY",
  "CHESS_AUDIT_HASH_KEY"]){
  if(!process.env[name])errors.push(`${name} required for the external audit archive`);
 }
 if((process.env.CHESS_AUDIT_HASH_KEY??"").length<32)
  errors.push("Audit pseudonymization key must be at least 32 characters");
 for(const name of ["CHESS_AUDIT_ARCHIVE_URL","CHESS_AUDIT_STATUS_URL"]){
  const raw=process.env[name];
  if(raw)try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||
     url.hostname!==process.env.CHESS_AUDIT_ALLOWED_HOST||
     url.username||url.password||url.hash||url.port)
    errors.push(`${name} must match the approved archive HTTPS hostname`);
  }catch{errors.push(`${name} has an invalid URL`);}
 }
 if(process.env.CHESS_AUDIT_RETENTION_APPROVED!=="true")
  errors.push("Immutable audit archive retention and deletion policy must be reviewed");
 if(process.env.CHESS_SCHEDULER_ENABLED!=="true")
  errors.push("Audit export requires approved tenant scheduler activation");
}
if(process.env.CHESS_AI_TRIAGE_ENABLED==="true"){
 for(const name of ["CHESS_AI_TRIAGE_API_URL","CHESS_AI_ALLOWED_HOST",
  "CHESS_AI_API_KEY"]){
  if(!process.env[name])errors.push(`${name} required for AI triage`);
 }
 const raw=process.env.CHESS_AI_TRIAGE_API_URL;
 if(raw)try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!==process.env.CHESS_AI_ALLOWED_HOST||
   url.username||url.password||url.hash||url.port)
   errors.push("AI triage URL must match the approved HTTPS host");
 }catch{errors.push("AI triage URL is malformed");}
 if(process.env.CHESS_AI_DATA_SHARING_APPROVED!=="true")
  errors.push("AI metadata sharing requires compliance approval");
 if(process.env.CHESS_AI_VENDOR_DPA_APPROVED!=="true")
  errors.push("AI provider DPA and privacy retention policy are not independently approved");
 if(process.env.CHESS_AI_COST_LIMIT_APPROVED!=="true")
  errors.push("AI provider per-request cost bound requires signed merchant agreement");
 if(process.env.CHESS_SCHEDULER_ENABLED!=="true")
  errors.push("Automated AI triage requires an approved tenant scheduler");
}
if(process.env.CHESS_BILLING_DELIVERY_ENABLED==="true"){
 for(const name of ["CHESS_BILLING_DELIVERY_API_URL",
  "CHESS_BILLING_STATUS_API_URL","CHESS_BILLING_ALLOWED_HOST",
  "CHESS_BILLING_API_KEY"]){
  if(!process.env[name])errors.push(`${name} required for invoice delivery`);
 }
 for(const name of ["CHESS_BILLING_DELIVERY_API_URL",
  "CHESS_BILLING_STATUS_API_URL"]){
  const raw=process.env[name];
  if(raw)try{
   const url=new URL(raw);
   if(url.protocol!=="https:"||url.hostname!==process.env.CHESS_BILLING_ALLOWED_HOST||
    url.username||url.password||url.hash||url.port)
    errors.push(`${name} must match the approved HTTPS billing vendor`);
  }catch{errors.push(`${name} is not a valid vendor URL`);}
 }
 if(process.env.CHESS_BILLING_VENDOR_CERTIFIED!=="true")
  errors.push("Billing vendor certification and client-contact mapping approval required");
}
if(process.env.CHESS_BANK_FEED_ENABLED==="true" ||
 process.env.CHESS_BANK_FEED_IMPORT_ENABLED==="true"){
 for(const name of ["CHESS_BANK_FEED_API_URL","CHESS_BANK_FEED_ALLOWED_HOST",
  "CHESS_BANK_FEED_API_KEY"]){
  if(!process.env[name])errors.push(`${name} required for bank feed import`);
 }
 const raw=process.env.CHESS_BANK_FEED_API_URL;
 if(raw)try{
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.hostname!==process.env.CHESS_BANK_FEED_ALLOWED_HOST||
   url.username||url.password||url.hash)
   errors.push("Bank feed gateway must be exact approved HTTPS host");
 }catch{errors.push("Bank feed gateway URL is malformed");}
 if(process.env.CHESS_BANK_FEED_SOURCE!=="PLAID")
  errors.push("Bank feed source must be explicitly approved PLAID");
 if(process.env.CHESS_BANK_FEED_ENABLED!=="true" ||
    process.env.CHESS_BANK_FEED_IMPORT_ENABLED!=="true")
  errors.push("Both bank feed enablement flags must be approved");
}
if(process.env.CHESS_PAYROLL_STATUS_ENABLED==="true"){
 const raw=process.env.CHESS_PAYROLL_STATUS_API_URL;
 if(!raw)errors.push("CHESS_PAYROLL_STATUS_API_URL required when payroll status enabled");
 else try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!==process.env.CHESS_PAYROLL_ALLOWED_HOST||
   u.username||u.password||u.hash)
   errors.push("Payroll status URL must match approved HTTPS provider host");
 }catch{errors.push("Payroll status URL is malformed");}
 if(process.env.CHESS_PAYROLL_PROVIDER_CERTIFIED!=="true")
  errors.push("Payroll status requires approved provider certification");
 if(process.env.CHESS_SCHEDULER_ENABLED!=="true")
  errors.push("Payroll status requires approved scheduler activation");
}
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
  "CHESS_CALENDAR_STATUS_API_URL",
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
