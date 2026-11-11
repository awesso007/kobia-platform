import {getTenantDb} from "@/lib/db/get-tenant-db";
import {auditArchiveConfigured,auditArchiveEnvelope,
 postAuditArchive,checkAuditArchive} from "./audit-archive-provider";

/** Bounded tenant-local audit export. The source rows remain append-only.
 * An uncertain send is never repeated; only a read-only status lookup
 * can resolve it. No actor, client, resource or business IDs leave our
 * boundary unpseudonymized. */
export async function runChessAuditArchive(){
 if(!auditArchiveConfigured())
  return {disabled:true,queued:0,examined:0,archived:0,unresolved:0,blocked:0};
 const {db,tenantId}=getTenantDb();
 // Late records, even if authored long after earlier events, are included
 // through the relation rather than a lossy timestamp high-water mark.
 const unqueued=await db.chessSecurityEvent.findMany({
  where:{archive:null},take:50,orderBy:[{occurredAt:"asc"},{id:"asc"}],
  select:{id:true,businessId:true,actorClerkUserId:true,
   action:true,resourceType:true,resourceId:true,decision:true,occurredAt:true},
 });
 let rejectedSource=0;
 const toQueue:{eventId:string;digest:string}[]=[];
 for(const event of unqueued){
  try{
   toQueue.push({eventId:event.id,
    digest:auditArchiveEnvelope(tenantId,event).digest});
  }catch{
   // Invalid historic event labels remain local for manual compliance review.
   // Do not send accidental names or document descriptions to an archive.
   rejectedSource++;
  }
 }
 if(toQueue.length){
  await db.chessAuditArchiveOutbox.createMany({
   data:toQueue,skipDuplicates:true,
  });
 }
 const rows=await db.chessAuditArchiveOutbox.findMany({
  where:{status:{in:["PENDING","UNKNOWN"]}},
  orderBy:{createdAt:"asc"},take:25,
  include:{event:true},
 });
 let archived=0,unresolved=0,blocked=rejectedSource;
 for(const row of rows){
  const envelope=auditArchiveEnvelope(tenantId,row.event);
  if(envelope.digest!==row.digest){blocked++;continue;}
  const fresh=await db.chessAuditArchiveOutbox.updateMany({where:{
   id:row.id,status:row.status,updatedAt:row.updatedAt,
  },data:{status:"SUBMITTING",attemptedAt:new Date()}});
  if(fresh.count!==1){blocked++;continue;}
  try{
   const response=row.status==="PENDING"?
    await postAuditArchive(envelope):await checkAuditArchive(envelope);
   const status=response.status==="archived"?"ARCHIVED":
    response.status==="rejected"?"REJECTED":"UNKNOWN";
   await db.chessAuditArchiveOutbox.updateMany({where:{
    id:row.id,status:"SUBMITTING",
   },data:{
    status,receiptId:response.receiptId??null,
    archivedAt:status==="ARCHIVED"?new Date():null,
    lastErrorCode:status==="UNKNOWN"?"REMOTE_OUTCOME_UNCONFIRMED":
     status==="REJECTED"?"ARCHIVE_REJECTED":null,
   }});
   if(status==="ARCHIVED")archived++;else if(status==="UNKNOWN")unresolved++;else blocked++;
  }catch{
   // Provider could have stored this event before a network timeout.
   // Never issue another create call until status resolves the original ID.
   await db.chessAuditArchiveOutbox.updateMany({where:{
    id:row.id,status:"SUBMITTING",
   },data:{status:"UNKNOWN",lastErrorCode:"ARCHIVE_DELIVERY_UNCONFIRMED"}});
   unresolved++;
  }
 }
 // A process can crash after DB claim and before provider response.
 // Stale SUBMITTING is ambiguous and must become UNKNOWN, not PENDING.
 const cutoff=new Date(Date.now()-2*60_000);
 const stuck=await db.chessAuditArchiveOutbox.updateMany({where:{
  status:"SUBMITTING",attemptedAt:{lt:cutoff},
 },data:{status:"UNKNOWN",lastErrorCode:"STALE_ARCHIVE_CLAIM"}});
 unresolved+=stuck.count;
 return {disabled:false,queued:unqueued.length,examined:rows.length,
  archived,unresolved,blocked};
}
export async function getChessAuditArchiveHealth(){
 const {db}=getTenantDb();
 const [pending,unknown,archived,rejected,unqueued]=await Promise.all([
  db.chessAuditArchiveOutbox.count({where:{status:{in:["PENDING","SUBMITTING"]}}}),
  db.chessAuditArchiveOutbox.count({where:{status:"UNKNOWN"}}),
  db.chessAuditArchiveOutbox.count({where:{status:"ARCHIVED"}}),
  db.chessAuditArchiveOutbox.count({where:{status:"REJECTED"}}),
  db.chessSecurityEvent.count({where:{archive:null}}),
 ]);
 return {configured:auditArchiveConfigured(),pending,unknown,archived,rejected,
  unqueued,healthy:unqueued===0&&pending===0&&unknown===0&&rejected===0};
}
