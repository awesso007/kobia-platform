import {createHash} from "node:crypto";
import {z} from "zod";
import {db as ledger} from "@/lib/db";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getTenantBySlug} from "@/lib/tenant";
import {PermissionError,getCurrentMembership} from "@/lib/rbac/require-permission";
import {getClientServiceLink} from "@/lib/client-profile/service";
import {assertBusinessManager} from "./business-manager";
import {isUsableConsent} from "./onboarding";
import {createBankPostingPreview,BankPostingPreviewError} from "./bank-posting-preview";
import {postJournalEntry} from "@/lib/accounting/ledger";
import {chessBankPostingEnabled,postingSourceRef} from "./bank-posting-gate";
import {chessDemoModeActive} from "./demo-mode";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

const accountService=z.enum(["ACCOUNTING","BOOKKEEPING"]);
const contextSchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 serviceCaseId:z.string().min(1).max(128),
 service:accountService,
}).strict();
const suggestSchema=contextSchema.extend({
 legacyBankTransactionId:z.string().min(1).max(128),
 suggestedAccountId:z.string().min(1).max(128).optional(),
 confidenceBasisPoints:z.number().int().min(0).max(10000).optional(),
}).strict();
const reviewSchema=z.object({
 businessId:z.string().min(1).max(128),
 reviewId:z.string().min(1).max(128),
 decision:z.enum(["APPROVED","REJECTED"]),
 approvedAccountId:z.string().min(1).max(128).optional(),
 expectedUpdatedAt:z.string().datetime(),
}).strict();

export type BankFingerprintInput={
 id:string;bankAccountId:string;dedupHash:string;postedDate:Date;
 amountCents:bigint;status:string;
};
/** Fingerprint binds approval to immutable monetary/date/source identifiers.
 * The bank's raw description and account number are never copied to CHESS. */
export function bankTransactionFingerprint(
 input:BankFingerprintInput,legacyTenantId:string,legacyEntityId:string,
):string{
 return createHash("sha256").update(JSON.stringify({
  tenant:legacyTenantId,entity:legacyEntityId,id:input.id,
  bankAccount:input.bankAccountId,sourceHash:input.dedupHash,
  date:input.postedDate.toISOString(),amount:input.amountCents.toString(),
  status:input.status,
 })).digest("hex");
}
async function context(raw:unknown){
 const data=contextSchema.parse(raw);
 const actor=await getCurrentMembership();
 if(!actor || actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const grant=await getClientServiceLink(data.clientProfileId,data.businessId,data.service);
 if(!grant)throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 const [serviceCase,consents,tenant]=await Promise.all([
  db.chessServiceCase.findFirst({where:{
   id:data.serviceCaseId,businessId:data.businessId,clientProfileId:data.clientProfileId,
   service:data.service,status:"ACTIVE",
  },select:{id:true}}),
  db.chessClientConsent.findMany({where:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   purpose:`service:${data.service}`,
  },select:{status:true,expiresAt:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
  getTenantBySlug(tenantId),
 ]);
 if(!serviceCase || !consents.some(x=>isUsableConsent(x)) || !tenant)
  throw new PermissionError("record:read");
 const mapping=await db.chessFinancialLink.findUnique({where:{
  serviceCaseId:data.serviceCaseId,
 },select:{businessId:true,clientProfileId:true,legacyTenantId:true,
  legacyEntityId:true,service:true}});
 if(!mapping || mapping.businessId!==data.businessId ||
  mapping.clientProfileId!==data.clientProfileId ||
  mapping.legacyTenantId!==tenant.id || mapping.service!==data.service)
  throw new PermissionError("record:read");
 const entity=await ledger.entity.findFirst({where:{
  tenantId:tenant.id,id:mapping.legacyEntityId,isActive:true,
 },select:{id:true}});
 if(!entity)throw new PermissionError("record:read");
 return {data,actor,db,legacyTenantId:tenant.id,legacyEntityId:entity.id};
}
async function loadTxn(tenantId:string,entityId:string,transactionId:string){
 const transaction=await ledger.bankTransaction.findFirst({
  where:{id:transactionId,tenantId,
   bankAccount:{tenantId,entityId,isActive:true}},
  select:{id:true,bankAccountId:true,dedupHash:true,postedDate:true,
   amountCents:true,status:true,categorizedJournalEntryId:true,
   bankAccount:{select:{glAccountId:true}}},
 });
 if(!transaction)throw new PermissionError("record:read");
 return transaction;
}
async function assertOffsetAccount(tenantId:string,entityId:string,accountId:string,bankGlId:string){
 const account=await ledger.account.findFirst({where:{
  id:accountId,tenantId,entityId,isActive:true,isSystem:false,
 },select:{id:true}});
 if(!account || account.id===bankGlId)throw new PermissionError("record:update");
 return account;
}
/** Suggestions never post or reclassify a bank transaction. Human review is
 * mandatory; posting must happen via the ledger's independently guarded path. */
export async function suggestChessBankReview(input:unknown){
 const data=suggestSchema.parse(input);
 const state=await context({businessId:data.businessId,
  clientProfileId:data.clientProfileId,serviceCaseId:data.serviceCaseId,
  service:data.service});
 const txn=await loadTxn(state.legacyTenantId,state.legacyEntityId,data.legacyBankTransactionId);
 if(txn.status!=="UNMATCHED")throw new PermissionError("record:create");
 if(data.suggestedAccountId)await assertOffsetAccount(state.legacyTenantId,
  state.legacyEntityId,data.suggestedAccountId,txn.bankAccount.glAccountId);
 const fingerprint=bankTransactionFingerprint(txn,state.legacyTenantId,state.legacyEntityId);
 return state.db.$transaction(async tx=>{
  const item=await tx.chessBankReview.create({data:{
   businessId:data.businessId,clientProfileId:data.clientProfileId,
   serviceCaseId:data.serviceCaseId,legacyTenantId:state.legacyTenantId,
   legacyEntityId:state.legacyEntityId,legacyBankTransactionId:txn.id,
   transactionDigest:fingerprint,suggestedAccountId:data.suggestedAccountId,
   confidenceBasisPoints:data.confidenceBasisPoints,
   createdByClerkUserId:state.actor.clerkUserId,
  },select:{id:true,status:true,createdAt:true}});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"BANK_REVIEW_SUGGESTED",resourceType:"ChessBankReview",
   resourceId:item.id,decision:"REVIEW",
  }});
  return item;
 });
}
export async function reviewChessBankSuggestion(input:unknown){
 const data=reviewSchema.parse(input);
 const reviewer=await assertBusinessManager(data.businessId);
 const {db,tenantId}=getTenantDb();
 const existing=await db.chessBankReview.findFirst({where:{
  id:data.reviewId,businessId:data.businessId,status:"PENDING",
 },select:{id:true,clientProfileId:true,serviceCaseId:true,legacyTenantId:true,
  legacyEntityId:true,legacyBankTransactionId:true,createdByClerkUserId:true,
  suggestedAccountId:true,transactionDigest:true,updatedAt:true}});
 if(!existing||existing.createdByClerkUserId===reviewer.clerkUserId ||
  existing.updatedAt.getTime()!==new Date(data.expectedUpdatedAt).getTime())
  throw new PermissionError("record:update");
 const legacyTenant=await getTenantBySlug(tenantId);
 if(!legacyTenant || legacyTenant.id!==existing.legacyTenantId)
  throw new PermissionError("record:update");
 const [serviceCase,consents]=await Promise.all([
  db.chessServiceCase.findFirst({where:{
   id:existing.serviceCaseId,businessId:data.businessId,
   clientProfileId:existing.clientProfileId,status:"ACTIVE",
   service:{in:["ACCOUNTING","BOOKKEEPING"]},
  },select:{service:true}}),
  db.chessClientConsent.findMany({where:{
   businessId:data.businessId,clientProfileId:existing.clientProfileId,
   purpose:{in:["service:ACCOUNTING","service:BOOKKEEPING"]},
  },select:{purpose:true,status:true,expiresAt:true,consentedAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
 ]);
 if(!serviceCase || !consents.some(x=>x.purpose===`service:${serviceCase.service}`&&isUsableConsent(x)))
  throw new PermissionError("record:update");
 const grant=await getClientServiceLink(existing.clientProfileId,data.businessId,serviceCase.service);
 if(!grant)throw new PermissionError("record:update");
 const mapping=await db.chessFinancialLink.findFirst({where:{
  serviceCaseId:existing.serviceCaseId,businessId:data.businessId,
  clientProfileId:existing.clientProfileId,service:serviceCase.service,
  legacyTenantId:existing.legacyTenantId,legacyEntityId:existing.legacyEntityId,
 },select:{id:true}});
 if(!mapping)throw new PermissionError("record:update");
 const txn=await loadTxn(existing.legacyTenantId,existing.legacyEntityId,existing.legacyBankTransactionId);
 const digest=bankTransactionFingerprint(txn,existing.legacyTenantId,existing.legacyEntityId);
 const stale=digest!==existing.transactionDigest || txn.status!=="UNMATCHED";
 let accountId:string|undefined;
 if(!stale && data.decision==="APPROVED"){
  accountId=data.approvedAccountId??existing.suggestedAccountId??undefined;
  if(!accountId)throw new PermissionError("record:update");
  await assertOffsetAccount(existing.legacyTenantId,existing.legacyEntityId,
   accountId,txn.bankAccount.glAccountId);
 }
 const now=new Date();
 return db.$transaction(async tx=>{
  const changed=await tx.chessBankReview.updateMany({where:{
   id:existing.id,businessId:data.businessId,status:"PENDING",
   updatedAt:existing.updatedAt,
  },data:{
   status:stale?"STALE":data.decision,
   approvedAccountId:stale?null:accountId??null,
   reviewedByClerkUserId:reviewer.clerkUserId,reviewedAt:now,
  }});
  if(!changed.count)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:reviewer.clerkUserId,
   action:stale?"BANK_REVIEW_STALE":"BANK_REVIEW_"+data.decision,
   resourceType:"ChessBankReview",resourceId:existing.id,
   decision:stale?"DENY":data.decision==="APPROVED"?"ALLOW":"REVIEW",
  }});
  return {id:existing.id,status:stale?"STALE":data.decision,
   // This is only review approval. Never assert it posted a journal entry.
   postedToLedger:false};
 });
}
export async function listChessBankReviews(raw:unknown){
 const state=await context(raw);
 return auditedChessSensitiveRead(state.db,{
  businessId:state.data.businessId,actorClerkUserId:state.actor.clerkUserId,
  action:"BANK_REVIEW_DETAILS_READ",
  resourceType:"ChessServiceCase",resourceId:state.data.serviceCaseId,
 },async tx=>{
  const [liveCase,membership,link,consents]=await Promise.all([
   tx.chessServiceCase.findFirst({where:{
    id:state.data.serviceCaseId,businessId:state.data.businessId,
    clientProfileId:state.data.clientProfileId,service:state.data.service,
    status:"ACTIVE",
   },select:{id:true}}),
   tx.membership.findUnique({where:{clerkUserId:state.actor.clerkUserId},
    select:{status:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:state.data.clientProfileId,businessId:state.data.businessId,
    service:state.data.service,
   }},select:{grants:{where:{
    clerkUserId:state.actor.clerkUserId,canRead:true,revokedAt:null,
   },select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    businessId:state.data.businessId,clientProfileId:state.data.clientProfileId,
    purpose:"service:"+state.data.service,
   },select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true}}),
  ]);
  if(!liveCase||membership?.status!=="ACTIVE"||!link?.grants.length||
   !consents.some(c=>isUsableConsent(c)))return null;
  return tx.chessBankReview.findMany({where:{
   serviceCaseId:state.data.serviceCaseId,businessId:state.data.businessId,
   legacyTenantId:state.legacyTenantId,
  },orderBy:{createdAt:"desc"},take:100,select:{
   id:true,status:true,legacyBankTransactionId:true,suggestedAccountId:true,
   approvedAccountId:true,confidenceBasisPoints:true,createdAt:true,updatedAt:true,
  }});
 });
}


/** Authorized clients and staff may review existing unmatched bank rows in
 * the legacy ledger. Nothing here copies raw transaction descriptions into
 * the CHESS registry or performs a ledger mutation. */
export async function listChessBankReviewCandidates(raw:unknown){
 const state=await context(raw);
 const [transactions,accounts]=await Promise.all([
  ledger.bankTransaction.findMany({where:{
   tenantId:state.legacyTenantId,status:"UNMATCHED",
   bankAccount:{tenantId:state.legacyTenantId,entityId:state.legacyEntityId,isActive:true},
  },orderBy:{postedDate:"desc"},take:100,select:{
   id:true,postedDate:true,description:true,amountCents:true,bankAccountId:true,
  }}),
  ledger.account.findMany({where:{
   tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
   isActive:true,isSystem:false,
  },orderBy:{code:"asc"},take:300,select:{
   id:true,code:true,name:true,type:true,
  }}),
 ]);
 return {transactions:transactions.map(t=>({
  id:t.id,postedDate:t.postedDate,description:t.description,
  amountCents:t.amountCents.toString(),bankAccountId:t.bankAccountId,
 })),accounts};
}


const postingPreviewContext=contextSchema.extend({
 reviewId:z.string().min(1).max(128),
}).strict();

/** Three distinct signed-in humans, current client consent/service grant,
 * approved mapping, scoped bank/GL accounts, and an unchanged fingerprint
 * are necessary to PREVIEW proposed journal lines. No database mutations. */
export async function previewChessApprovedBankPosting(input:unknown){
 const data=postingPreviewContext.parse(input);
 const state=await context({businessId:data.businessId,
  clientProfileId:data.clientProfileId,serviceCaseId:data.serviceCaseId,
  service:data.service});
 const review=await state.db.chessBankReview.findFirst({where:{
  id:data.reviewId,businessId:data.businessId,clientProfileId:data.clientProfileId,
  serviceCaseId:data.serviceCaseId,legacyTenantId:state.legacyTenantId,
  legacyEntityId:state.legacyEntityId,status:"APPROVED",
 },select:{status:true,createdByClerkUserId:true,reviewedByClerkUserId:true,
  approvedAccountId:true,transactionDigest:true,legacyBankTransactionId:true}});
 if(!review||!review.approvedAccountId)throw new PermissionError("record:read");
 const txn=await loadTxn(state.legacyTenantId,state.legacyEntityId,
  review.legacyBankTransactionId);
 await assertOffsetAccount(state.legacyTenantId,state.legacyEntityId,
  review.approvedAccountId,txn.bankAccount.glAccountId);
 try{
  return createBankPostingPreview(review,{
   id:txn.id,bankAccountGlId:txn.bankAccount.glAccountId,
   amountCents:txn.amountCents,status:txn.status,
   fingerprint:bankTransactionFingerprint(txn,state.legacyTenantId,state.legacyEntityId),
  },state.actor);
 }catch(error){
  if(error instanceof BankPostingPreviewError)throw new PermissionError("record:read");
  throw error;
 }
}


const postingSchema=postingPreviewContext.extend({
 expectedTransactionDigest:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Manual, three-identity bank-review posting. This is disabled by default
 * until separate financial policy, bank sandbox and operator approvals.
 *
 * Cross-schema CHESS consent and legacy GL cannot share a transaction.
 * Every attempt is audited BEFORE the legacy mutation. A crash after a
 * successful legacy COMMIT may leave the CHESS outcome UNKNOWN; subsequent
 * attempts inspect the existing bank-row/JEs rather than duplicate posting.
 * External bank statement settlement/reconciliation remains separate. */
export async function executeChessApprovedBankPosting(input:unknown){
 const data=postingSchema.parse(input);
 if(!chessBankPostingEnabled(process.env)||chessDemoModeActive())
  throw new PermissionError("record:update");
 const state=await context({
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  serviceCaseId:data.serviceCaseId,service:data.service,
 });
 if(!["OWNER","ADMIN"].includes(state.actor.role))throw new PermissionError("record:update");
 const review=await state.db.chessBankReview.findFirst({where:{
  id:data.reviewId,businessId:data.businessId,
  clientProfileId:data.clientProfileId,serviceCaseId:data.serviceCaseId,
  legacyTenantId:state.legacyTenantId,legacyEntityId:state.legacyEntityId,
  status:"APPROVED",
 },select:{id:true,status:true,createdByClerkUserId:true,reviewedByClerkUserId:true,
  approvedAccountId:true,transactionDigest:true,legacyBankTransactionId:true}});
 if(!review||!review.approvedAccountId||
  review.transactionDigest!==data.expectedTransactionDigest)
  throw new PermissionError("record:update");
 const txn=await loadTxn(state.legacyTenantId,state.legacyEntityId,
  review.legacyBankTransactionId);
 const snapshotDigest=bankTransactionFingerprint({...txn,status:"UNMATCHED"},
  state.legacyTenantId,state.legacyEntityId);
 if(snapshotDigest!==data.expectedTransactionDigest)
  throw new PermissionError("record:update");
 const sourceRefId=postingSourceRef(review.id);
 // Only the identical recorded CHESS posting may be replayed. The ledger
 // transaction is the authority, not an unverified CHESS response flag.
 if(txn.status==="CATEGORIZED"&&txn.categorizedJournalEntryId){
  const posted=await ledger.journalEntry.findFirst({where:{
   id:txn.categorizedJournalEntryId,tenantId:state.legacyTenantId,
   entityId:state.legacyEntityId,source:"BANK_FEED",
   sourceRefId,status:"POSTED",
  },select:{id:true}});
  if(!posted)throw new PermissionError("record:update");
  return {postedToLedger:true,replay:true,journalEntryId:posted.id,
   bankTransactionId:txn.id,bankSettled:false};
 }
 if(txn.status!=="UNMATCHED")throw new PermissionError("record:update");
 await assertOffsetAccount(state.legacyTenantId,state.legacyEntityId,
  review.approvedAccountId,txn.bankAccount.glAccountId);
 const [bank,entity,offset]=await Promise.all([
  ledger.bankAccount.findFirst({where:{
   id:txn.bankAccountId,tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
   isActive:true,currency:"USD",
  },select:{glAccountId:true}}),
  ledger.entity.findFirst({where:{
   id:state.legacyEntityId,tenantId:state.legacyTenantId,
   isActive:true,baseCurrency:"USD",
  },select:{id:true}}),
  ledger.account.findFirst({where:{
   id:review.approvedAccountId,tenantId:state.legacyTenantId,
   entityId:state.legacyEntityId,isActive:true,isSystem:false,
  },select:{id:true}}),
 ]);
 if(!bank||bank.glAccountId!==txn.bankAccount.glAccountId||!entity||!offset)
  throw new PermissionError("record:update");
 const preview=createBankPostingPreview(review,{
  id:txn.id,bankAccountGlId:bank.glAccountId,amountCents:txn.amountCents,
  status:txn.status,fingerprint:bankTransactionFingerprint(
   txn,state.legacyTenantId,state.legacyEntityId),
 },state.actor);

 // Audit intent before any GL write. If the audit store is unavailable,
 // financial execution is forbidden. No PII or bank description is logged.
 await state.db.chessSecurityEvent.create({data:{
  businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
  action:"BANK_POSTING_ATTEMPT",resourceType:"ChessBankReview",
  resourceId:review.id,decision:"REVIEW",
 }});

 const created=await ledger.$transaction(async tx=>{
  // First lock the bank row with a conditional UPDATE. A concurrent posting
  // will fail this predicate; no account balance or JE changes will persist.
  const claim=await tx.bankTransaction.updateMany({where:{
   id:txn.id,tenantId:state.legacyTenantId,
   bankAccountId:txn.bankAccountId,status:"UNMATCHED",
   dedupHash:txn.dedupHash,amountCents:txn.amountCents,
   postedDate:txn.postedDate,
  },data:{status:"CATEGORIZED"}});
  if(claim.count!==1)throw new PermissionError("record:update");
  const journal=await postJournalEntry({
   tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
   entryDate:txn.postedDate,description:"CHESS approved bank classification",
   source:"BANK_FEED",sourceRefId,
   lines:preview.lines.map(line=>({
    accountId:line.accountId,debitCents:BigInt(line.debitCents),
    creditCents:BigInt(line.creditCents),
   })),
  },{client:tx});
  await tx.bankTransaction.update({where:{id:txn.id},data:{
   categorizedJournalEntryId:journal.id,
   categorizedAt:new Date(),categorizedByUserId:state.actor.clerkUserId,
  }});
  return journal.id;
 },{isolationLevel:"Serializable"});

 // If the audit receipt fails, the API must not claim the external outcome
 // succeeded. A retry resolves the verified source journal without posting.
 await state.db.chessSecurityEvent.create({data:{
  businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
  action:"BANK_POSTED_TO_LEDGER",resourceType:"ChessBankReview",
  resourceId:review.id,decision:"ALLOW",
 }});
 return {postedToLedger:true,replay:false,journalEntryId:created,
  bankTransactionId:txn.id,bankSettled:false};
}
