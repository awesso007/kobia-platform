/** Manual, read-only legacy consent inventory before any migration rollout.
 * Never changes client records or prints client IDs, policy text, emails or
 * evidence digests. NOT a legal proof of electronic signature authenticity. */
import {Client as PgClient} from "pg";
import {consentAuditConfiguration,aggregateConsentAuditRows} from
 "./chess-consent-audit-policy.mjs";
const config=consentAuditConfiguration(process.env);
const db=new PgClient({
 connectionString:config.url.toString(),connectionTimeoutMillis:7000,
 ssl:{rejectUnauthorized:true},
});
await db.connect();
try{
 await db.query("BEGIN TRANSACTION READ ONLY");
 const role=await db.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,
   r.rolreplication,
   has_schema_privilege(current_user,$1,'CREATE') AS schema_create,
   has_table_privilege(current_user,$2,'INSERT') AS can_insert,
   has_table_privilege(current_user,$2,'UPDATE') AS can_update,
   has_table_privilege(current_user,$2,'DELETE') AS can_delete
   FROM pg_roles r WHERE r.rolname=current_user`,
   [config.schema,`${config.schema}."ChessClientConsent"`]);
 const p=role.rows[0];
 if(!p||p.rolsuper||p.rolcreatedb||p.rolcreaterole||p.rolreplication||
  p.schema_create||p.can_insert||p.can_update||p.can_delete)
  throw new Error("Audit connection has unsafe write or administration privileges.");
 const consent=await db.query(`SELECT "status"::text AS status,
    count(*)::integer AS total,
    count(*) FILTER(WHERE "status"='GRANTED' AND
      ("consentedAt" IS NULL OR "consentedAt">CURRENT_TIMESTAMP OR
       NULLIF("acceptedByClerkUserId",'') IS NULL OR
       "verifiedEmailDigest" IS NULL OR
       "verifiedEmailDigest" !~ '^[0-9a-f]{64}$' OR
       "acceptanceEvidenceDigest" IS NULL OR
       "acceptanceEvidenceDigest" !~ '^[0-9a-f]{64}$' OR
       length("policyText")<50 OR "withdrawnAt" IS NOT NULL))::integer AS "malformedGrant",
    count(*) FILTER(WHERE "status"='PENDING' AND
      ("consentedAt" IS NOT NULL OR "acceptedByClerkUserId" IS NOT NULL OR
       "verifiedEmailDigest" IS NOT NULL OR
       "acceptanceEvidenceDigest" IS NOT NULL OR "withdrawnAt" IS NOT NULL))::integer AS "pendingWithEvidence",
    count(*) FILTER(WHERE "status"='GRANTED' AND
       "expiresAt" IS NOT NULL AND "expiresAt"<=CURRENT_TIMESTAMP)::integer AS "expiredStillGranted",
    count(*) FILTER(WHERE "status"='WITHDRAWN' AND
      ("withdrawnAt" IS NULL OR "consentedAt" IS NULL OR
       "acceptedByClerkUserId" IS NULL))::integer AS "otherInvalid"
    FROM "${config.schema}"."ChessClientConsent" GROUP BY "status"`);
 const {summary,issues}=aggregateConsentAuditRows(consent.rows);
 const triggers=await db.query(`SELECT tgname,tgenabled FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname='ChessClientConsent'
      AND t.tgname='chess_consent_evidence_write_once'
      AND NOT t.tgisinternal`,[config.schema]);
 const present=triggers.rows.some(t=>t.tgenabled!=="D");
 await db.query("ROLLBACK");
 console.log("Consent legacy audit: aggregate totals only.");
 console.log(JSON.stringify({
  reviewTicket:config.ticket,
  ...summary,detectedIssues:issues,writeOnceTriggerActive:present,
 }));
 if(issues>0){
  process.exitCode=1;
  console.error("RELEASE BLOCKED: invalid or expired consent evidence requires independent review and reissuance.");
 }else console.log("PASS: no structural consent anomalies detected. Signature provenance is still unverified.");
 if(!present)console.log("NOTICE: consent write-once trigger not yet active; approved migration remains required.");
}catch(err){
 try{await db.query("ROLLBACK");}catch{}
 throw err;
}finally{await db.end();}
