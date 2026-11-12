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
import {commitLegacyBankClassification} from "./bank-ledger-commit";
import {reconcileLegacyChessPosting} from "./bank-ledger-reconcile";
import {chessBankPostingEnabled,postingSourceRef,bankGlAccountMatchesType} from "./bank-posting-gate";
import {chessDemoModeActive} from "./demo-mode";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";
import {
 reserveChessBankPostingAttempt,
 startChessBankPostingAttempt,
 markChessBankPostingAttemptUnknown,
 markChessBankPostingAttemptCommitted,
} from "./bank-financial-attempt";

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
  },select:{id:true,status:true,expiresAt:true,consentedAt:true,withdrawnAt:true,
   acceptedByClerkUserId:true,verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
  getTenantBySlug(tenantId),
 ]);
 const usableConsent=consents.find(x=>isUsableConsent(x));
 if(!serviceCase || !usableConsent || !tenant)
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
 return {data,actor,db,consentId:usableConsent.id,
  legacyTenantId:tenant.id,legacyEntityId:entity.id};
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
 return auditedChessSensitiveRead(state.db,{
  businessId:state.data.businessId,actorClerkUserId:state.actor.clerkUserId,
  action:"BANK_CANDIDATES_READ",
  resourceType:"ChessServiceCase",resourceId:state.data.serviceCaseId,
 },async tx=>{
  // Recheck CHESS permissions and purpose-specific consent inside a tenant
  // SERIALIZABLE transaction. The legacy bank/GL SELECT is separate, so its
  // cross-database freshness must still be independently tested in staging.
  const [member,unit,serviceCase,link,consents,mapping]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:state.actor.clerkUserId},
    select:{status:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:state.data.businessId},
    select:{status:true}}),
   tx.chessServiceCase.findFirst({where:{
    id:state.data.serviceCaseId,businessId:state.data.businessId,
    clientProfileId:state.data.clientProfileId,service:state.data.service,
    status:"ACTIVE",
   },select:{id:true}}),
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
    acceptanceEvidenceDigest:true,withdrawnAt:true}}),
   tx.chessFinancialLink.findUnique({where:{
    serviceCaseId:state.data.serviceCaseId,
   },select:{businessId:true,clientProfileId:true,service:true,
    legacyTenantId:true,legacyEntityId:true}}),
  ]);
  if(member?.status!=="ACTIVE"||unit?.status!=="ACTIVE"||!serviceCase||
   !link?.grants.length||!consents.some(c=>isUsableConsent(c))||
   mapping?.businessId!==state.data.businessId||
   mapping.clientProfileId!==state.data.clientProfileId||
   mapping.service!==state.data.service||
   mapping.legacyTenantId!==state.legacyTenantId||
   mapping.legacyEntityId!==state.legacyEntityId)return null;
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
 });
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
 if(!chessBankPostingEnabled({
  CHESS_BANK_POSTING_ENABLED:process.env.CHESS_BANK_POSTING_ENABLED,
  CHESS_BANK_POSTING_POLICY_APPROVED:process.env.CHESS_BANK_POSTING_POLICY_APPROVED,
  CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED:process.env.CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED,
  CHESS_BANK_POSTING_OPERATOR_APPROVED:process.env.CHESS_BANK_POSTING_OPERATOR_APPROVED,
 })||process.env.CHESS_DEMO_MODE==="true"||chessDemoModeActive())
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

 // Historical approvals are not perpetual execution rights: the creator
 // and reviewer must still be active, and the reviewer must still be
 // authorized to manage this same business at posting time.
 const signers=await state.db.membership.findMany({where:{
  clerkUserId:{in:[review.createdByClerkUserId,
   review.reviewedByClerkUserId??""]},
  status:"ACTIVE",
 },select:{clerkUserId:true,role:true}});
 const signerById=new Map(signers.map(s=>[s.clerkUserId,s]));
 const creator=signerById.get(review.createdByClerkUserId);
 const approver=signerById.get(review.reviewedByClerkUserId??"");
 if(!creator||!approver)throw new PermissionError("record:update");
 const [creatorAssignment,reviewerAssignment]=await Promise.all([
  state.db.chessEmployeeAssignment.findUnique({where:{
   businessId_clerkUserId:{businessId:data.businessId,
    clerkUserId:creator.clerkUserId},
  },select:{revokedAt:true}}),
  state.db.chessEmployeeAssignment.findUnique({where:{
   businessId_clerkUserId:{businessId:data.businessId,
    clerkUserId:approver.clerkUserId},
  },select:{revokedAt:true,role:true}}),
 ]);
 const creatorAllowed=["OWNER","ADMIN"].includes(creator.role)||
  !!creatorAssignment&&!creatorAssignment.revokedAt;
 const reviewerAllowed=["OWNER","ADMIN"].includes(approver.role)||
  (!!reviewerAssignment&&!reviewerAssignment.revokedAt&&
   reviewerAssignment.role==="MANAGER");
 if(!creatorAllowed||!reviewerAllowed)
  throw new PermissionError("record:update");
 const sourceRefId=postingSourceRef(review.id);
  // Only the identical, balanced source journal may be replayed. A durable
  // attempt receipt is pinned if the previous request lost its response.
  if(txn.status==="CATEGORIZED"&&txn.categorizedJournalEntryId){
   const reconciled=await reconcileLegacyChessPosting(ledger,{
    tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
    bankTransactionId:txn.id,sourceRefId,
   });
   if(reconciled.status!=="MATCHED_POSTED"||
    reconciled.journalEntryId!==txn.categorizedJournalEntryId)
    throw new PermissionError("record:update");
   const attempt=await state.db.chessFinancialAttempt.findUnique({
    where:{sourceRefId},select:{id:true,status:true,journalEntryId:true},
   });
   if(attempt){
    if(attempt.status==="EXECUTING"||attempt.status==="UNKNOWN"){
     const pinned=await markChessBankPostingAttemptCommitted(
      state.db,attempt.id,state.actor.clerkUserId,reconciled.journalEntryId);
     if(!pinned)throw new PermissionError("record:update");
    }else if(attempt.status!=="COMMITTED"||
     attempt.journalEntryId!==reconciled.journalEntryId){
     throw new PermissionError("record:update");
    }
   }
   return {postedToLedger:true,replay:true,journalEntryId:reconciled.journalEntryId,
    bankTransactionId:txn.id,bankSettled:false};
  }
  if(txn.status!=="UNMATCHED")throw new PermissionError("record:update");
 await assertOffsetAccount(state.legacyTenantId,state.legacyEntityId,
  review.approvedAccountId,txn.bankAccount.glAccountId);
 const [bank,entity,offset,bankGl]=await Promise.all([
  ledger.bankAccount.findFirst({where:{
   id:txn.bankAccountId,tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
   isActive:true,currency:"USD",
  },select:{glAccountId:true,accountType:true}}),
  ledger.entity.findFirst({where:{
   id:state.legacyEntityId,tenantId:state.legacyTenantId,
   isActive:true,baseCurrency:"USD",
  },select:{id:true}}),
  ledger.account.findFirst({where:{
   id:review.approvedAccountId,tenantId:state.legacyTenantId,
   entityId:state.legacyEntityId,isActive:true,isSystem:false,
  },select:{id:true}}),
  ledger.account.findFirst({where:{
   id:txn.bankAccount.glAccountId,tenantId:state.legacyTenantId,
   entityId:state.legacyEntityId,isActive:true,
  },select:{id:true,type:true}}),
 ]);
 if(!bank||bank.glAccountId!==txn.bankAccount.glAccountId||!entity||!offset||
  !bankGl||!bankGlAccountMatchesType(bank.accountType,bankGl.type))
  throw new PermissionError("record:update");
 createBankPostingPreview(review,{
   id:txn.id,bankAccountGlId:bank.glAccountId,amountCents:txn.amountCents,
   status:txn.status,fingerprint:bankTransactionFingerprint(
    txn,state.legacyTenantId,state.legacyEntityId),
  },state.actor);

  // Reserve and audit in the tenant DB before any legacy GL mutation. The
  // reservation and consent withdrawal serialize on the same consent row.
  const attempt=await reserveChessBankPostingAttempt(state.db,{
   businessId:data.businessId,consentId:state.consentId,reviewId:review.id,
   legacyTenantId:state.legacyTenantId,legacyEntityId:state.legacyEntityId,
   legacyBankTransactionId:txn.id,sourceDigest:data.expectedTransactionDigest,
   sourceRefId,createdByClerkUserId:state.actor.clerkUserId,
  });
  if(attempt.status!=="RESERVED")throw new PermissionError("record:update");

  // Audit intent before any GL write. If the audit store is unavailable,
  // financial execution is forbidden. No PII or bank description is logged.
  await state.db.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"BANK_POSTING_ATTEMPT",resourceType:"ChessBankReview",
   resourceId:review.id,decision:"REVIEW",
  }});

  // Re-evaluate case, grant, mapping and consent; then acquire the consent
  // row lock and move RESERVED -> EXECUTING immediately before the GL write.
  await context({businessId:data.businessId,clientProfileId:data.clientProfileId,
   serviceCaseId:data.serviceCaseId,service:data.service});
  const started=await startChessBankPostingAttempt(
   state.db,attempt.id,state.actor.clerkUserId);
  if(!started)throw new PermissionError("record:update");

  let created:string;
  try{
   created=await commitLegacyBankClassification(ledger,{
    tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
    bankTransactionId:txn.id,bankAccountId:txn.bankAccountId,
    dedupHash:txn.dedupHash,postedDate:txn.postedDate,
    amountCents:txn.amountCents,bankGlAccountId:bank.glAccountId,
    offsetAccountId:offset.id,sourceRefId,actorId:state.actor.clerkUserId,
   });
  }catch(error){
   // The legacy transaction may have committed even if its acknowledgement
   // was lost. Preserve UNKNOWN and require independent reconciliation.
   await markChessBankPostingAttemptUnknown(
    state.db,attempt.id,state.actor.clerkUserId).catch(()=>undefined);
   throw error;
  }
  const pinned=await markChessBankPostingAttemptCommitted(
   state.db,attempt.id,state.actor.clerkUserId,created);
  if(!pinned)throw new Error("Legacy posting completed but the CHESS attempt receipt is not pinned; reconciliation is required.");
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


/** Independently guarded, read-only source-to-legacy ledger reconciliation.
 * This is not bank settlement, not a financial posting retry, and does not
 * release UNKNOWN external provider outcomes. Every successful or denied
 * scoped result commits a privacy-minimal tenant audit before returning. */
export async function reconcileChessApprovedBankPosting(input:unknown){
 const data=postingPreviewContext.parse(input);
 const state=await context({
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  serviceCaseId:data.serviceCaseId,service:data.service,
 });
 if(!["OWNER","ADMIN"].includes(state.actor.role))
  throw new PermissionError("record:read");
 return auditedChessSensitiveRead(state.db,{
  businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
  action:"BANK_POSTING_RECONCILIATION_READ",
  resourceType:"ChessBankReview",resourceId:data.reviewId,
 },async tx=>{
  const [member,unit,caseRow,link,consents,mapping,review]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:state.actor.clerkUserId},
    select:{status:true,role:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},
    select:{status:true}}),
   tx.chessServiceCase.findFirst({where:{
    id:data.serviceCaseId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:data.service,
    status:"ACTIVE",
   },select:{id:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:data.clientProfileId,businessId:data.businessId,
    service:data.service,
   }},select:{grants:{where:{
    clerkUserId:state.actor.clerkUserId,canRead:true,revokedAt:null,
   },select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    businessId:data.businessId,clientProfileId:data.clientProfileId,
    purpose:"service:"+data.service,
   },select:{status:true,expiresAt:true,consentedAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true,withdrawnAt:true}}),
   tx.chessFinancialLink.findUnique({where:{
    serviceCaseId:data.serviceCaseId,
   },select:{businessId:true,clientProfileId:true,service:true,
    legacyTenantId:true,legacyEntityId:true}}),
   tx.chessBankReview.findFirst({where:{
    id:data.reviewId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,serviceCaseId:data.serviceCaseId,
    legacyTenantId:state.legacyTenantId,
    legacyEntityId:state.legacyEntityId,status:"APPROVED",
   },select:{id:true,legacyBankTransactionId:true}}),
  ]);
  if(member?.status!=="ACTIVE"||
   !["OWNER","ADMIN"].includes(member.role)||
   unit?.status!=="ACTIVE"||!caseRow||!link?.grants.length||
   !consents.some(c=>isUsableConsent(c))||
   mapping?.businessId!==data.businessId||
   mapping.clientProfileId!==data.clientProfileId||
   mapping.service!==data.service||
   mapping.legacyTenantId!==state.legacyTenantId||
   mapping.legacyEntityId!==state.legacyEntityId||
   !review)return null;
  return reconcileLegacyChessPosting(ledger,{
   tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
   bankTransactionId:review.legacyBankTransactionId,
   sourceRefId:postingSourceRef(review.id),
  });
 });
}

/** Separate release flags for tenant receipt reconciliation. A verified
 * legacy journal is the ONLY acceptable successful resolution. Never retry
 * a missing/unposted GL or reissue an ambiguous bank classification. */
export function bankOutcomeResolutionEnabled(env:{
 CHESS_BANK_OUTCOME_RESOLUTION_ENABLED?:string;
 CHESS_BANK_OUTCOME_POLICY_APPROVED?:string;
}):boolean{
 return env.CHESS_BANK_OUTCOME_RESOLUTION_ENABLED==="true"&&
  env.CHESS_BANK_OUTCOME_POLICY_APPROVED==="true";
}
export function independentBankOutcomeResolver(input:{
 creator:string;reviewer:string|null;executor:string;resolver:string;
 status:string;executionStartedAt:Date|null;
},now=new Date()):boolean{
 if(!input.reviewer||
  new Set([input.creator,input.reviewer,input.executor,input.resolver]).size!==4)
  return false;
 return input.status==="UNKNOWN"||
  (input.status==="EXECUTING"&&!!input.executionStartedAt&&
    now.getTime()-input.executionStartedAt.getTime()>=30*60*1000);
}

/** Explicit fourth-person, source-bound resolution of a lost legacy GL
 * acknowledgement. No call to commitLegacyBankClassification exists here.
 * UNPOSTED, DIVERGED and UNKNOWN ledger observations NEVER cause retries,
 * failed closure, consent release, or fabricated settlement.
 */
export async function resolveChessApprovedBankPostingOutcome(raw:unknown){
 const data=postingPreviewContext.parse(raw);
 if(!bankOutcomeResolutionEnabled({
   CHESS_BANK_OUTCOME_RESOLUTION_ENABLED:process.env.CHESS_BANK_OUTCOME_RESOLUTION_ENABLED,
   CHESS_BANK_OUTCOME_POLICY_APPROVED:process.env.CHESS_BANK_OUTCOME_POLICY_APPROVED,
  })||process.env.CHESS_DEMO_MODE==="true"||chessDemoModeActive())
  throw new PermissionError("record:update");
 const state=await context({
  businessId:data.businessId,clientProfileId:data.clientProfileId,
  serviceCaseId:data.serviceCaseId,service:data.service,
 });
 if(!["OWNER","ADMIN"].includes(state.actor.role))
  throw new PermissionError("record:update");
 const review=await state.db.chessBankReview.findFirst({where:{
  id:data.reviewId,businessId:data.businessId,
  clientProfileId:data.clientProfileId,serviceCaseId:data.serviceCaseId,
  legacyTenantId:state.legacyTenantId,legacyEntityId:state.legacyEntityId,
  status:"APPROVED",
 },select:{id:true,createdByClerkUserId:true,reviewedByClerkUserId:true,
  legacyBankTransactionId:true,transactionDigest:true}});
 if(!review)throw new PermissionError("record:update");
 const attempt=await state.db.chessFinancialAttempt.findUnique({where:{
  sourceRefId:postingSourceRef(review.id),
 },select:{id:true,businessId:true,consentId:true,reviewId:true,
  status:true,createdByClerkUserId:true,sourceDigest:true,
  legacyTenantId:true,legacyEntityId:true,legacyBankTransactionId:true,
  executionStartedAt:true}});
 if(!attempt||attempt.businessId!==data.businessId||
  attempt.consentId!==state.consentId||attempt.reviewId!==review.id||
  attempt.sourceDigest!==review.transactionDigest||
  attempt.legacyTenantId!==state.legacyTenantId||
  attempt.legacyEntityId!==state.legacyEntityId||
  attempt.legacyBankTransactionId!==review.legacyBankTransactionId||
  !independentBankOutcomeResolver({
   creator:review.createdByClerkUserId,reviewer:review.reviewedByClerkUserId,
   executor:attempt.createdByClerkUserId,resolver:state.actor.clerkUserId,
   status:attempt.status,executionStartedAt:attempt.executionStartedAt,
  }))throw new PermissionError("record:update");

 const observed=await reconcileLegacyChessPosting(ledger,{
  tenantId:state.legacyTenantId,entityId:state.legacyEntityId,
  bankTransactionId:review.legacyBankTransactionId,
  sourceRefId:postingSourceRef(review.id),
 });
 if(observed.status!=="MATCHED_POSTED"||!observed.journalEntryId)
  return {status:"UNRESOLVED" as const,ledgerObservation:observed.status,
   bankSettled:false,automaticallyRetried:false};

 return state.db.$transaction(async tx=>{
  const [member,unit,serviceCase,link,consents,mapping,currentReview,current]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:state.actor.clerkUserId},
    select:{status:true,role:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:data.businessId},select:{status:true}}),
   tx.chessServiceCase.findFirst({where:{
    id:data.serviceCaseId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,service:data.service,status:"ACTIVE",
   },select:{id:true}}),
   tx.clientServiceLink.findUnique({where:{profileId_businessId_service:{
    profileId:data.clientProfileId,businessId:data.businessId,service:data.service,
   }},select:{grants:{where:{
    clerkUserId:state.actor.clerkUserId,canRead:true,revokedAt:null,
   },select:{id:true}}}}),
   tx.chessClientConsent.findMany({where:{
    id:attempt.consentId,businessId:data.businessId,
    clientProfileId:data.clientProfileId,purpose:"service:"+data.service,
   },select:{status:true,consentedAt:true,expiresAt:true,withdrawnAt:true,
    acceptedByClerkUserId:true,verifiedEmailDigest:true,
    acceptanceEvidenceDigest:true}}),
   tx.chessFinancialLink.findUnique({where:{serviceCaseId:data.serviceCaseId},
    select:{businessId:true,clientProfileId:true,service:true,
     legacyTenantId:true,legacyEntityId:true}}),
   tx.chessBankReview.findUnique({where:{id:review.id},select:{
    status:true,createdByClerkUserId:true,reviewedByClerkUserId:true,
    legacyBankTransactionId:true,transactionDigest:true}}),
   tx.chessFinancialAttempt.findUnique({where:{id:attempt.id},select:{
    status:true,createdByClerkUserId:true,executionStartedAt:true,
    consentId:true,sourceDigest:true,journalEntryId:true,
   }}),
  ]);
  if(member?.status!=="ACTIVE"||
    !["OWNER","ADMIN"].includes(member.role)||
    unit?.status!=="ACTIVE"||!serviceCase||!link?.grants.length||
    !consents.some(c=>isUsableConsent(c))||
    mapping?.businessId!==data.businessId||
    mapping.clientProfileId!==data.clientProfileId||
    mapping.service!==data.service||
    mapping.legacyTenantId!==state.legacyTenantId||
    mapping.legacyEntityId!==state.legacyEntityId||
    currentReview?.status!=="APPROVED"||
    currentReview.transactionDigest!==review.transactionDigest||
    currentReview.legacyBankTransactionId!==review.legacyBankTransactionId||
    current?.consentId!==attempt.consentId||
    current.sourceDigest!==attempt.sourceDigest||
    !!current.journalEntryId||
    !independentBankOutcomeResolver({
     creator:currentReview.createdByClerkUserId,
     reviewer:currentReview.reviewedByClerkUserId,
     executor:current.createdByClerkUserId,
     resolver:state.actor.clerkUserId,status:current.status,
     executionStartedAt:current.executionStartedAt,
    }))throw new PermissionError("record:update");
  const now=new Date();
  const changed=await tx.chessFinancialAttempt.updateMany({where:{
   id:attempt.id,businessId:data.businessId,
   status:current.status,
   journalEntryId:null,
  },data:{status:"COMMITTED",journalEntryId:observed.journalEntryId,
   resolvedAt:now,lastErrorCode:null}});
  if(changed.count!==1)throw new PermissionError("record:update");
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:state.actor.clerkUserId,
   action:"BANK_POSTING_INDEPENDENT_RECEIPT_RECONCILED",
   resourceType:"ChessFinancialAttempt",resourceId:attempt.id,decision:"ALLOW",
  }});
  return {status:"COMMITTED" as const,
   ledgerObservation:"MATCHED_POSTED" as const,
   journalEntryId:observed.journalEntryId,
   bankSettled:false,automaticallyRetried:false};
 },{isolationLevel:"Serializable"});
}
