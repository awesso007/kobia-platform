/**
 * Read-only dual-database reconciliation primitive: match the expected
 * CHESS-approved review reference with the actual legacy posted journal,
 * the bank transaction's categorization pointer and balanced GL lines.
 * Never post, retry, reverse, settle or reissue any bank transaction here.
 */
import type {PrismaClient} from "@prisma/client";

type Observation={
 transaction:{status:string;categorizedJournalEntryId:string|null;
  amountCents:bigint;bankGlAccountId:string}|null;
 journals:{id:string;status:string;reversalOfId:string|null;
  reversedById:string|null;lines:{accountId:string;debitCents:bigint;
   creditCents:bigint}[]}[];
};
export type BankReconciliationStatus=
 "UNPOSTED"|"MATCHED_POSTED"|"DIVERGED"|"UNKNOWN";

export function classifyLegacyChessPosting(o:Observation):BankReconciliationStatus{
 if(!o.transaction)return "UNKNOWN";
 if(o.journals.length>1)return "DIVERGED";
 const txn=o.transaction,entry=o.journals[0]??null;
 if(txn.status==="UNMATCHED"&&!txn.categorizedJournalEntryId&&!entry)
  return "UNPOSTED";
 if(txn.status!=="CATEGORIZED"||!txn.categorizedJournalEntryId||!entry||
  entry.id!==txn.categorizedJournalEntryId||
  entry.status!=="POSTED"||entry.reversalOfId||entry.reversedById||
  entry.lines.length!==2||txn.amountCents===0n)return "DIVERGED";
 const [cash,offset]=entry.lines;
 const sumDebit=entry.lines.reduce((n,x)=>n+x.debitCents,0n);
 const sumCredit=entry.lines.reduce((n,x)=>n+x.creditCents,0n);
 const magnitude=txn.amountCents>0n?txn.amountCents:-txn.amountCents;
 if(!cash||!offset||cash.accountId!==txn.bankGlAccountId||
  offset.accountId===cash.accountId||sumDebit!==magnitude||
  sumCredit!==magnitude||entry.lines.some(x=>x.debitCents<0n||
   x.creditCents<0n||(x.debitCents>0n&&x.creditCents>0n))||
  cash.debitCents!==(txn.amountCents>0n?magnitude:0n)||
  cash.creditCents!==(txn.amountCents<0n?magnitude:0n)||
  offset.debitCents!==cash.creditCents||
  offset.creditCents!==cash.debitCents)return "DIVERGED";
 return "MATCHED_POSTED";
}

export async function reconcileLegacyChessPosting(db:PrismaClient,input:{
 tenantId:string;entityId:string;bankTransactionId:string;
 sourceRefId:string;
}):Promise<{status:BankReconciliationStatus;journalEntryId:string|null;
 bankSettled:false;requiresIndependentReview:boolean}>{
 if(!input.sourceRefId.startsWith("chess-bank-review:"))
  throw new Error("Unrecognized CHESS bank review reference.");
 const [txn,journals]=await Promise.all([
  db.bankTransaction.findFirst({where:{
   id:input.bankTransactionId,tenantId:input.tenantId,
   bankAccount:{tenantId:input.tenantId,entityId:input.entityId},
  },select:{status:true,categorizedJournalEntryId:true,amountCents:true,
   bankAccount:{select:{glAccountId:true}}}}),
  db.journalEntry.findMany({where:{
   tenantId:input.tenantId,entityId:input.entityId,
   source:"BANK_FEED",sourceRefId:input.sourceRefId,
  },select:{id:true,status:true,reversalOfId:true,reversedById:true,
   lines:{orderBy:{lineNumber:"asc"},select:{
    accountId:true,debitCents:true,creditCents:true,
   }}},take:2}),
 ]);
 const status=classifyLegacyChessPosting({
  transaction:txn?{
   status:txn.status,categorizedJournalEntryId:txn.categorizedJournalEntryId,
   amountCents:txn.amountCents,bankGlAccountId:txn.bankAccount.glAccountId,
  }:null,journals,
 });
 return {status,journalEntryId:status==="MATCHED_POSTED"?
  journals[0]?.id??null:null,bankSettled:false,
  requiresIndependentReview:status==="DIVERGED"||status==="UNKNOWN"};
}
