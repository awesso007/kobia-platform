/** Pure drill timing checks. These validate operator-provided timestamps,
 * but are not independent proof of the observed source/restore recovery. */
function utc(raw,label){
 if(typeof raw!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/.test(raw))
  throw new Error(label+" must be an explicit UTC ISO time.");
 const n=Date.parse(raw);
 if(!Number.isFinite(n))throw new Error(label+" has invalid date/time.");
 return n;
}
function minutes(raw,label){
 const num=Number(raw);
 if(!Number.isInteger(num)||num<1||num>1440)
  throw new Error(label+" must be 1-1440 whole minutes.");
 return num;
}
export function validateDrRecoveryEvidence(input,now=Date.now()){
 const start=utc(input.startedAt,"Drill start"),
  ready=utc(input.restoreReadyAt,"Restore readiness"),
  source=utc(input.sourceLatestAt,"Source recovery point"),
  restored=utc(input.restoredLatestAt,"Restored recovery point");
 const maxRto=minutes(input.rtoTargetMinutes,"RTO target"),
  maxRpo=minutes(input.rpoTargetMinutes,"RPO target");
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(input.evidenceTicket??""))
  throw new Error("An opaque independent drill evidence reference is required.");
 if(start>now+300_000||ready>now+300_000||
  ready<=start||source>ready||restored>ready||source<restored)
  throw new Error("Recovery timeline is inconsistent or future-dated.");
 const rto=(ready-start)/60_000,rpo=(source-restored)/60_000;
 if(rto>maxRto||rpo>maxRpo)
  throw new Error("Measured values exceed declared RTO/RPO targets.");
 return {rtoMinutes:Number(rto.toFixed(2)),
  rpoMinutes:Number(rpo.toFixed(2)),
  rtoTargetMinutes:maxRto,rpoTargetMinutes:maxRpo};
}
