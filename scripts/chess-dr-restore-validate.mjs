/** Read-only disaster-recovery evidence check against a SEPARATE restored
 * PostgreSQL instance and encrypted, version-locked backup object.
 * No backup is created, no restore is performed, no production rows are
 * read or changed. A successful run cannot prove a tested RTO/RPO. */
import {S3Client,HeadObjectCommand,GetBucketVersioningCommand} from "@aws-sdk/client-s3";
import {Client as Postgres} from "pg";
function required(name){
 const value=process.env[name];
 if(!value)throw new Error(name+" missing from protected DR environment");
 return value;
}
if(process.env.CHESS_DR_VALIDATE!=="true"||
 process.env.CHESS_DR_ISOLATED_RESTORE!=="true")
 throw new Error("Independent DR restore verification has not been authorized.");
const source=new URL(required("DIRECT_URL"));
const restored=new URL(required("CHESS_DR_RESTORE_DATABASE_URL"));
if(restored.hostname!==required("CHESS_DR_RESTORE_ALLOWED_HOST"))
 throw new Error("Restore URL does not match the approved isolated PostgreSQL host");
if(source.protocol!=="postgresql:"&&source.protocol!=="postgres:")
 throw new Error("Source DB URL has invalid protocol.");
if(restored.protocol!=="postgresql:"&&restored.protocol!=="postgres:")
 throw new Error("Restored DB URL has invalid protocol.");
// Same hostname alone is not sufficient isolation. Require a different
// DB name, explicitly provisioned with read-only user and distinct secret.
if(source.pathname===restored.pathname)
 throw new Error("Restore validation must use a separate database name.");
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
try{
 const versioning=await client.send(new GetBucketVersioningCommand({Bucket:bucket}));
 if(versioning.Status!=="Enabled")throw new Error("Backup bucket lacks object versioning");
 const object=await client.send(new HeadObjectCommand({
  Bucket:bucket,Key:key,VersionId:version,
 }));
 if(!object.VersionId||object.VersionId!==version||
    object.ContentLength===undefined||object.ContentLength<100||
    object.ObjectLockMode!=="COMPLIANCE"||
    !object.ObjectLockRetainUntilDate||
    object.ObjectLockRetainUntilDate.getTime()<Date.now()+24*3600_000||
    !["AES256","aws:kms","aws:kms:dsse"].includes(String(object.ServerSideEncryption)))
  throw new Error("Backup artifact lacks a pinned, encrypted immutable object version.");
 const age=object.LastModified?Date.now()-object.LastModified.getTime():Number.NaN;
 const maxAge=Number(process.env.CHESS_DR_MAX_BACKUP_AGE_HOURS??24);
 if(!Number.isFinite(maxAge)||maxAge<1||maxAge>72||
  !Number.isFinite(age)||age<0||age>maxAge*3600_000)
  throw new Error("Backup object exceeds approved recency threshold.");
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
  `SELECT id FROM "${schema}"."ChessSecurityEvent" WHERE id=$1 LIMIT 1`,[witness]);
 if(marker.rows.length!==1)
  throw new Error("Known immutable security-event witness absent from restored tenant DB");
 const metadata=await pg.query(
  `SELECT count(*)::integer AS count FROM "${schema}"."ChessBusinessUnit"`);
 if(!Number.isInteger(metadata.rows[0]?.count))
  throw new Error("Restored tenant schema is not queryable");
 const tables=await pg.query(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema=$1 AND table_name IN
   ('ChessClientConsent','ChessSecurityEvent','ChessAuditArchiveOutbox',
    'ChessBillingInvoice','ChessRegulatedWorkflow')`,[schema]);
 if(tables.rows.length!==5)
  throw new Error("Restored database is missing critical CHESS tenant tables");
 await pg.query("ROLLBACK");
 console.log("PASS isolated PostgreSQL restore contains the nominated immutable audit witness and required tenant tables.");
 console.log("WARNING: RPO/RTO, foreign-key/financial reconciliations, restore automation and live failover still require separate signed drill evidence.");
}catch(error){
 try{await pg.query("ROLLBACK");}catch{/* Connection may be unavailable */}
 throw error;
}finally{await pg.end();}
