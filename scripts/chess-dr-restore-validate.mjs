/** Read-only disaster-recovery evidence check against a SEPARATE restored
 * PostgreSQL instance and encrypted, version-locked backup object.
 * No backup is created, no restore is performed, no production rows are
 * read or changed. A successful run cannot prove a tested RTO/RPO. */
import {S3Client,HeadObjectCommand,GetBucketVersioningCommand} from "@aws-sdk/client-s3";
import {Client as Postgres} from "pg";
import {validateDrIsolation,validateDrBackupMetadata} from "./chess-dr-policy.mjs";
import {validateDrRecoveryEvidence} from "./chess-dr-evidence.mjs";
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" missing from protected DR environment");
 return value;
}
if(process.env.CHESS_DR_VALIDATE!=="true"||
 process.env.CHESS_DR_ISOLATED_RESTORE!=="true")
 throw new Error("Independent DR restore verification has not been authorized.");
const {restored}=validateDrIsolation(required("DIRECT_URL"),
 required("CHESS_DR_RESTORE_DATABASE_URL"),
 required("CHESS_DR_RESTORE_ALLOWED_HOST"),
 process.env.CHESS_DR_REQUIRE_PG_SSL);
const slug=required("CHESS_DR_TEST_TENANT");
if(!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug))
 throw new Error("Restore tenant slug is not safe for PostgreSQL schema.");
const schema="tenant_"+slug.replaceAll("-","_");
const witness=required("CHESS_DR_WITNESS_SECURITY_EVENT_ID");
if(!/^[a-z0-9_-]{6,128}$/i.test(witness))
 throw new Error("Invalid immutable audit event witness reference.");
const bucket=required("CHESS_DR_BACKUP_BUCKET");
const key=required("CHESS_DR_BACKUP_OBJECT_KEY");
const version=required("CHESS_DR_BACKUP_OBJECT_VERSION");
const endpoint=process.env.CHESS_DR_BACKUP_ENDPOINT;
if(endpoint){
 const parsed=new URL(endpoint);
 if(parsed.protocol!=="https:"||
   parsed.hostname!==required("CHESS_DR_BACKUP_ALLOWED_HOST")||
   parsed.username||parsed.password||parsed.hash)
  throw new Error("DR backup endpoint is not an approved HTTPS host");
}
const client=new S3Client({
 region:required("CHESS_DR_BACKUP_REGION"),
 endpoint:endpoint||undefined,
 forcePathStyle:!!endpoint,
 credentials:{accessKeyId:required("CHESS_DR_BACKUP_ACCESS_KEY_ID"),
  secretAccessKey:required("CHESS_DR_BACKUP_SECRET_ACCESS_KEY")},
});
let backupTime;
try{
 const versioning=await client.send(new GetBucketVersioningCommand({Bucket:bucket}));
 if(versioning.Status!=="Enabled")throw new Error("Backup bucket lacks object versioning");
 const object=await client.send(new HeadObjectCommand({
  Bucket:bucket,Key:key,VersionId:version,
 }));
 backupTime=validateDrBackupMetadata(object,version,
  process.env.CHESS_DR_MAX_BACKUP_AGE_HOURS??24);
 console.log("PASS versioned, encrypted WORM backup artifact meets freshness threshold.");
}finally{client.destroy();}

const pg=new Postgres({
 connectionString:restored.toString(),
 connectionTimeoutMillis:7000,
 ssl:process.env.CHESS_DR_REQUIRE_PG_SSL==="true"?{rejectUnauthorized:true}:undefined,
});
await pg.connect();
try{
 await pg.query("BEGIN TRANSACTION READ ONLY");
 const marker=await pg.query(
  `SELECT id, "occurredAt" FROM "${schema}"."ChessSecurityEvent" WHERE id=$1 LIMIT 1`,[witness]);
 if(marker.rows.length!==1)
  throw new Error("Known immutable security-event witness absent from restored tenant DB");
 const drill=validateDrRecoveryEvidence({
  startedAt:required("CHESS_DR_DRILL_STARTED_AT"),
  restoreReadyAt:required("CHESS_DR_RESTORE_READY_AT"),
  sourceLatestAt:required("CHESS_DR_SOURCE_LATEST_AT"),
  restoredLatestAt:required("CHESS_DR_RESTORED_LATEST_AT"),
  rtoTargetMinutes:required("CHESS_DR_RTO_TARGET_MINUTES"),
  rpoTargetMinutes:required("CHESS_DR_RPO_TARGET_MINUTES"),
  evidenceTicket:required("CHESS_DR_EVIDENCE_TICKET"),
 });
 if(marker.rows[0].occurredAt instanceof Date&&
  marker.rows[0].occurredAt.getTime()>
   Date.parse(required("CHESS_DR_RESTORED_LATEST_AT")))
  throw new Error("Restored recovery-point timestamp predates the audit witness.");
 if(!(marker.rows[0].occurredAt instanceof Date)||
  marker.rows[0].occurredAt.getTime()>backupTime.getTime())
  throw new Error("Witness must predate the pinned backup artifact.");
 const metadata=await pg.query(
  `SELECT count(*)::integer AS count FROM "${schema}"."ChessBusinessUnit"`);
 if(!Number.isInteger(metadata.rows[0]?.count))
  throw new Error("Restored tenant schema is not queryable");
 const requiredTables=[
  "ChessClientConsent","ChessClientDocument","ChessSecurityEvent",
  "ChessAuditArchiveOutbox","ChessBillingInvoice","ChessRegulatedWorkflow",
  "ChessOperationalPeriodSnapshot","ChessMerchantPaymentEvent",
 ];
 const tables=await pg.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema=$1 AND table_name=ANY($2::text[])`,
  [schema,requiredTables]);
 if(tables.rows.length!==requiredTables.length)
  throw new Error("Restored database is missing critical consent, archive, billing or audit tables");
 // The restore validator credential must not have any write authority.
 const perms=await pg.query(
  `SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,
    has_database_privilege(current_user,current_database(),'CREATE') AS db_create,
    has_schema_privilege(current_user,$1,'CREATE') AS schema_create
   FROM pg_roles r WHERE r.rolname=current_user`,[schema]);
 const account=perms.rows[0];
 if(!account||account.rolsuper||account.rolcreatedb||
  account.rolcreaterole||account.rolreplication||
  account.db_create||account.schema_create)
  throw new Error("DR database witness account has unsafe administrative rights.");
 const mutable=await pg.query(
  `SELECT c.relname,has_table_privilege(current_user,c.oid,'INSERT') AS insert_ok,
    has_table_privilege(current_user,c.oid,'UPDATE') AS update_ok,
    has_table_privilege(current_user,c.oid,'DELETE') AS delete_ok
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=$1 AND c.relname=ANY($2::text[])`,[schema,requiredTables]);
 if(mutable.rows.length!==requiredTables.length||mutable.rows.some(row=>
   row.insert_ok||row.update_ok||row.delete_ok))
  throw new Error("Restore witness account has mutation privileges.");
 const requiredTriggers=[
  "chess_security_event_immutable","chess_audit_archive_receipt_write_once",
  "chess_consent_evidence_write_once","chess_document_lifecycle_immutable",
  "chess_operational_snapshot_immutable","chess_merchant_event_immutable",
 ];
 const triggers=await pg.query(
  `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=$1 AND NOT t.tgisinternal AND t.tgenabled='O'
     AND t.tgname=ANY($2::text[])`,[schema,requiredTriggers]);
 if(triggers.rows.length!==requiredTriggers.length)
  throw new Error("Restored consent, document, audit, billing or report triggers missing or disabled.");
 // Independent record identity witnesses for consent and invoicing
 // make empty-but-valid restored schemas insufficient to pass the drill.
 const consentWitness=required("CHESS_DR_WITNESS_CONSENT_ID");
 const invoiceWitness=required("CHESS_DR_WITNESS_INVOICE_ID");
 if(!/^[A-Za-z0-9_-]{6,128}$/.test(consentWitness)||
    !/^[A-Za-z0-9_-]{6,128}$/.test(invoiceWitness))
  throw new Error("Invalid opaque recovery record witness reference.");
 const identities=await Promise.all([
  pg.query(`SELECT id FROM "${schema}"."ChessClientConsent" WHERE id=$1 LIMIT 1`,
   [consentWitness]),
  pg.query(`SELECT id FROM "${schema}"."ChessBillingInvoice" WHERE id=$1 LIMIT 1`,
   [invoiceWitness]),
 ]);
 if(identities.some(x=>x.rows.length!==1))
  throw new Error("Restore is missing the approved consent or invoice evidence witness.");
 await pg.query("ROLLBACK");
 console.log("PASS isolated PostgreSQL restore contains the nominated immutable audit witness and required tenant tables.");
 console.log("PASS operator-reported drill timing within declared RPO/RTO targets "+
  "(RTO "+drill.rtoMinutes+" minutes, RPO "+drill.rpoMinutes+" minutes).");
 console.log("WARNING: timestamps are provided by operators, not independent telemetry. "+
  "Signed recovery evidence, financial reconciliation and real failover remain external requirements.");
}catch(error){
 try{await pg.query("ROLLBACK");}catch{/* Connection may be unavailable */}
 throw error;
}finally{await pg.end();}
