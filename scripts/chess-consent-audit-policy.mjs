/** All checks are local and read-only. Do not log connection URLs, client
 * IDs, contact data, consent text or acceptance digests. */
export function consentAuditConfiguration(env){
 if(env.CHESS_CONSENT_AUDIT_ENABLED!=="true"||
  env.CHESS_CONSENT_AUDIT_ISOLATED!=="true")
  throw new Error("Protected, isolated consent audit not authorized.");
 const tenant=env.CHESS_CONSENT_AUDIT_TENANT||"";
 if(!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(tenant))
  throw new Error("Tenant slug is invalid.");
 const allowed=env.CHESS_CONSENT_AUDIT_ALLOWED_HOST;
 const raw=env.CHESS_CONSENT_AUDIT_DATABASE_URL;
 if(!raw||!allowed)throw new Error("Consent read-only database connection not configured.");
 let url;
 try{url=new URL(raw);}catch{throw new Error("Invalid consent audit database URL.");}
 if(!["postgresql:","postgres:"].includes(url.protocol)||
  url.hostname!==allowed||url.hash||url.searchParams.get("sslmode")!=="verify-full")
  throw new Error("Consent audit needs pinned PostgreSQL hostname and verified TLS.");
 const ticket=env.CHESS_CONSENT_AUDIT_REVIEW_TICKET||"";
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(ticket))
  throw new Error("Named review ticket required to run consent audit.");
 return {url,schema:"tenant_"+tenant.replaceAll("-","_"),ticket};
}
const states=new Set(["PENDING","GRANTED","WITHDRAWN","EXPIRED"]);
export function aggregateConsentAuditRows(rows){
 const summary={total:0,malformedGrant:0,pendingWithEvidence:0,
  expiredStillGranted:0,otherInvalid:0};
 for(const row of rows){
  if(!states.has(row.status))throw new Error("Unrecognized consent state.");
  const fields=["total","malformedGrant","pendingWithEvidence",
   "expiredStillGranted","otherInvalid"];
  for(const key of fields){
   const n=Number(row[key]);
   if(!Number.isSafeInteger(n)||n<0||n>10_000_000)
    throw new Error("Consent audit count not valid.");
   summary[key]+=n;
  }
 }
 const issues=summary.malformedGrant+summary.pendingWithEvidence+
  summary.expiredStillGranted+summary.otherInvalid;
 return {summary,issues};
}
