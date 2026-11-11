/** Pure, credential-free disaster recovery policy checks.
 * These can be regression tested without touching live backup infrastructure. */
export function validateDrIsolation(sourceUrl,restoreUrl,allowHost,sslRequired){
 const source=new URL(sourceUrl),restored=new URL(restoreUrl);
 if(!["postgres:","postgresql:"].includes(source.protocol)||
  !["postgres:","postgresql:"].includes(restored.protocol))
  throw new Error("DR database URLs must be PostgreSQL.");
 if(!allowHost||restored.hostname!==allowHost)
  throw new Error("Restored DB host does not match the allowlist.");
 if(!source.hostname||!restored.hostname||
  source.hostname===restored.hostname)
  throw new Error("DR restore must use a separate, isolated database host.");
 if(!source.pathname||!restored.pathname||
  source.pathname==="/"||restored.pathname==="/"||
  source.pathname===restored.pathname)
  throw new Error("DR restore must use a separate named database.");
 if(sslRequired!=="true"||/disable|allow|prefer|no-verify/i.test(
  restored.searchParams.get("sslmode")??""))
  throw new Error("DR restored database requires verified TLS.");
 return {source,restored};
}
export function validateDrBackupMetadata(object,version,maxAgeHours,now=new Date()){
 const maxAge=Number(maxAgeHours);
 if(!Number.isFinite(maxAge)||maxAge<1||maxAge>72)
  throw new Error("Invalid backup freshness threshold.");
 if(!object||object.VersionId!==version||!version||
  !Number.isInteger(object.ContentLength)||object.ContentLength<100||
  object.ObjectLockMode!=="COMPLIANCE"||
  !object.ObjectLockRetainUntilDate||
  object.ObjectLockRetainUntilDate.getTime()<=now.getTime()+24*3600_000||
  !["AES256","aws:kms","aws:kms:dsse"].includes(String(object.ServerSideEncryption)))
  throw new Error("Backup must be version-pinned, encrypted and compliance locked.");
 if(!(object.LastModified instanceof Date))
  throw new Error("Backup timestamp missing.");
 const age=now.getTime()-object.LastModified.getTime();
 if(!Number.isFinite(age)||age<0||age>maxAge*3600_000)
  throw new Error("Backup is not inside the approved age window.");
 return object.LastModified;
}
