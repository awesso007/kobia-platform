import {z} from "zod";
import {db as ledger} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {assertBusinessManager} from "./business-manager";
import {isUsableConsent} from "./onboarding";
import {bankFeedImportConfigured,fetchChessBankFeed,feedDedupHash} from "./bank-feed-provider";

const input=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING"]),
 legacyBankAccountId:z.string().min(1).max(128),
 providerAccountRef:z.string().regex(/^[A-Za-z0-9_-]{6,160}$/),
}).strict();
const operation=z.object({
 businessId:z.string().min(1).max(128),
 connectionId:z.string().min(1).max(128),
}).strict();
const importInput=operation.extend({
 sinceAt:z.string().datetime(),
}).strict();
function requireOwnerAdmin(actor:{role:string;status:string}|null){
 if(!actor || actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:update");
}
async function authorizeConnection(businessId:string,connectionId:string){
 const actor=await assertBusinessManager(businessId);
 requireOwnerAdmin(actor);
 const {db,tenantId}=getTenantDb();
 const tenant=await getTenantBySlug(tenantId);
 if(!tenant)throw new PermissionError("record:read");
 const conn=await db.chessBankFeedConnection.findFirst({
  where:{id:connectionId,businessId,legacyTenantId:tenant.id},
 });
 if(!conn)throw new PermissionError("record:read");
 const serviceCase=await db.chessServiceCase.findFirst({where:{
  id:conn.serviceCaseId,businessId,clientProfileId:conn.clientProfileId,
  service:{in:["ACCOUNTING","BOOKKEEPING"]},status:"ACTIVE",
 },select:{service:true}});
 if(!serviceCase)throw new PermissionError("record:read");
 const grant=await getClientServiceLink(conn.clientProfileId,businessId,serviceCase.service);
 if(!grant)throw new PermissionError("record:read");
 const consents=await db.chessClientConsent.findMany({where:{
  businessId,clientProfileId:conn.clientProfileId,
  purpose:`bank_feed:${serviceCase.service}`,
 },select:{status:true,expiresAt:true,consentedAt:true,
  acceptedByClerkUserId:true,verifiedEmailDigest:true,
  acceptanceEvidenceDigest:true}});
 if(!consents.some(x=>isUsableConsent(x)))throw new PermissionError("record:read");
 const bank=await ledger.bankAccount.findFirst({where:{
  id:conn.legacyBankAccountId,tenantId:tenant.id,
  entityId:conn.legacyEntityId,isActive:true,currency:"USD",
 },select:{id:true,tenantId:true,entityId:true}});
 if(!bank)throw new PermissionError("record:read");
 return {actor,db,conn,bank,tenant};
}
export async function registerChessBankFeed(value:unknown){
 const data=input.parse(value);
 const actor=await assertBusinessManager(data.businessId);
 requireOwnerAdmin(actor);
 const grant=await getClientServiceLink(data.clientProfileId,data.businessId,data.service);
 if(!grant)throw new PermissionError("record:create");
 const {db,tenantId}=getTenantDb();
 const tenant=await getTenantBySlug(tenantId);
 if(!tenant)throw new PermissionError("record:create");
 const [serviceCase,mapping]=await Promise.all([
  db.chessServiceCase.findFirst({where:{
   id:data.serviceCaseId,businessId:data.businessId,
   clientProfileId:data.clientProfileId,service:data.service,
   status:"ACTIVE",
  },select:{id:true}}),
  db.chessFinancialLink.findFirst({where:{
   serviceCaseId:data.serviceCaseId,businessId:data.businessId,
   clientProfileId:data.clientProfileId,service:data.service,
   legacyTenantId:tenant.id,
  },select:{legacyEntityId:true}}),
 ]);
 if(!serviceCase||!mapping)throw new PermissionError("record:create");
 const bank=await ledger.bankAccount.findFirst({where:{
  id:data.legacyBankAccountId,tenantId:tenant.id,
  entityId:mapping.legacyEntityId,isActive:true,currency:"USD",
 },select:{id:true}});
 if(!bank)throw new PermissionError("record:create");
 return db.$transaction(async tx=>{
  const connection=await tx.chessBankFeedConnection.create({data:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   serviceCaseId:data.serviceCaseId,legacyTenantId:tenant.id,
   legacyEntityId:mapping.legacyEntityId,legacyBankAccountId:bank.id,
   providerAccountRef:data.providerAccountRef,
   createdByClerkUserId:actor.clerkUserId,
  },select:{id:true,businessId:true,active:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"BANK_FEED_CONNECTION_REGISTERED",resourceType:"ChessBankFeedConnection",
   resourceId:connection.id,decision:"REVIEW",
  }});
  return connection;
 });
}
export async function activateChessBankFeed(value:unknown,active:boolean){
 const data=operation.parse(value);
 const authorized=await authorizeConnection(data.businessId,data.connectionId);
 if(active&&!bankFeedImportConfigured())throw new Error("Bank feed integration not configured.");
 return authorized.db.$transaction(async tx=>{
  const updated=await tx.chessBankFeedConnection.updateMany({where:{
   id:data.connectionId,businessId:data.businessId,
  },data:{active}});
  if(updated.count)await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:authorized.actor.clerkUserId,
   action:active?"BANK_FEED_ACTIVATED":"BANK_FEED_PAUSED",
   resourceType:"ChessBankFeedConnection",resourceId:data.connectionId,decision:"ALLOW",
  }});
  return {updated:updated.count===1,active};
 });
}
/** Imports normalized posted transactions into existing legacy ledger
 * UNMATCHED queue only. NEVER creates or posts a journal entry. */
export async function importChessBankFeed(value:unknown){
 const data=importInput.parse(value);
 const authorized=await authorizeConnection(data.businessId,data.connectionId);
 if(!authorized.conn.active || !bankFeedImportConfigured())
  throw new PermissionError("record:update");
 const since=new Date(data.sinceAt),now=new Date();
 if(!Number.isFinite(since.getTime())||since>=now ||
   since.getTime()<now.getTime()-90*86400000)
  throw new RangeError("Bank feed import window must be within the last 90 days.");
 const {db,actor,conn,bank,tenant}=authorized;
 const audit=await db.chessBankFeedSyncRun.create({data:{
  businessId:data.businessId,connectionId:conn.id,requestedStartAt:since,
  initiatedByClerkUserId:actor.clerkUserId,
 },select:{id:true}});
 try{
  const feed=await fetchChessBankFeed(conn.providerAccountRef,since);
  const prepared=feed.map(t=>({
   tenantId:tenant.id,bankAccountId:bank.id,
   postedDate:new Date(t.postedDate),description:t.description,
   amountCents:BigInt(t.amountCents),
   dedupHash:feedDedupHash(tenant.id,bank.id,t.externalId),
   source:"PLAID" as const,status:"UNMATCHED" as const,
  }));
  const imported=prepared.length?await ledger.bankTransaction.createMany({
   data:prepared,skipDuplicates:true,
  }):{count:0};
  await db.$transaction(async tx=>{
   await tx.chessBankFeedSyncRun.update({where:{id:audit.id},data:{
    status:"COMPLETED",fetchedCount:feed.length,insertedCount:imported.count,
   }});
   await tx.chessSecurityEvent.create({data:{
    businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
    action:"BANK_FEED_IMPORTED_UNMATCHED",resourceType:"ChessBankFeedSyncRun",
    resourceId:audit.id,decision:"REVIEW",
   }});
  });
  return {importId:audit.id,fetched:feed.length,imported:imported.count,
   postedToLedger:false};
 }catch{
  await db.chessBankFeedSyncRun.updateMany({where:{
   id:audit.id,status:"STARTED",
  },data:{status:"FAILED",errorCode:"IMPORT_OR_AUDIT_FAILED"}});
  throw new Error("Bank import failed; previously imported rows may be safely deduplicated on retry.");
 }
}
export async function listChessBankFeedConnections(businessId:string){
 const actor=await assertBusinessManager(businessId);
 requireOwnerAdmin(actor);
 const {db}=getTenantDb();
 return db.chessBankFeedConnection.findMany({where:{businessId},
  orderBy:{createdAt:"desc"},take:100,select:{
   id:true,serviceCaseId:true,legacyBankAccountId:true,active:true,
   createdAt:true,updatedAt:true,
  }});
}
