/**
 * Source-transaction plus double-entry GL mutation in a SINGLE legacy
 * PostgreSQL transaction. Never call without the separately authenticated,
 * approved three-person CHESS handler and its durable attempt audit.
 * The CHESS tenant's approval store is a separate transaction boundary.
 */
import type {PrismaClient} from "@prisma/client";
import {postJournalEntry} from "@/lib/accounting/ledger";
import {bankGlAccountMatchesType} from "./bank-posting-gate";

export type LegacyBankClassification={
 tenantId:string;entityId:string;bankTransactionId:string;bankAccountId:string;
 dedupHash:string;postedDate:Date;amountCents:bigint;
 bankGlAccountId:string;offsetAccountId:string;
 sourceRefId:string;actorId:string;
};
export class LegacyBankClassificationError extends Error{
 constructor(){super("Bank/GL source changed or is not approved for posting.");
  this.name="LegacyBankClassificationError";}
}
export async function commitLegacyBankClassification(
 db:PrismaClient,source:LegacyBankClassification,
):Promise<string>{
 if(source.amountCents===0n||
  source.bankGlAccountId===source.offsetAccountId||
  !source.sourceRefId.startsWith("chess-bank-review:"))
  throw new LegacyBankClassificationError();
 return db.$transaction(async tx=>{
  // Claim the single UNMATCHED bank row. Serializable conflicts roll back
  // the source row, JE lines, status AND account balance changes together.
  const claimed=await tx.bankTransaction.updateMany({where:{
   id:source.bankTransactionId,tenantId:source.tenantId,
   bankAccountId:source.bankAccountId,status:"UNMATCHED",
   dedupHash:source.dedupHash,postedDate:source.postedDate,
   amountCents:source.amountCents,
  },data:{status:"CATEGORIZED"}});
  if(claimed.count!==1)throw new LegacyBankClassificationError();
  const [bank,entity,glAccounts]=await Promise.all([
   tx.bankAccount.findFirst({where:{
    id:source.bankAccountId,tenantId:source.tenantId,
    entityId:source.entityId,isActive:true,currency:"USD",
   },select:{glAccountId:true,accountType:true}}),
   tx.entity.findFirst({where:{
    id:source.entityId,tenantId:source.tenantId,
    isActive:true,baseCurrency:"USD",
   },select:{id:true}}),
   tx.account.findMany({where:{
    id:{in:[source.bankGlAccountId,source.offsetAccountId]},
    tenantId:source.tenantId,entityId:source.entityId,isActive:true,
   },select:{id:true,type:true,isSystem:true}}),
  ]);
  const bankGl=glAccounts.find(a=>a.id===source.bankGlAccountId);
  const offset=glAccounts.find(a=>a.id===source.offsetAccountId);
  if(!bank||!entity||!bankGl||!offset||offset.isSystem||
   bank.glAccountId!==source.bankGlAccountId||
   !bankGlAccountMatchesType(bank.accountType,bankGl.type))
   throw new LegacyBankClassificationError();

  const magnitude=source.amountCents>0n?source.amountCents:-source.amountCents;
  const bankDebit=source.amountCents>0n?magnitude:0n;
  const bankCredit=source.amountCents<0n?magnitude:0n;
  const journal=await postJournalEntry({
   tenantId:source.tenantId,entityId:source.entityId,
   entryDate:source.postedDate,description:"CHESS approved bank classification",
   source:"BANK_FEED",sourceRefId:source.sourceRefId,
   lines:[
    {accountId:source.bankGlAccountId,debitCents:bankDebit,creditCents:bankCredit},
    {accountId:source.offsetAccountId,debitCents:bankCredit,creditCents:bankDebit},
   ],
  },{client:tx});
  await tx.bankTransaction.update({where:{id:source.bankTransactionId},data:{
   categorizedJournalEntryId:journal.id,categorizedAt:new Date(),
   categorizedByUserId:source.actorId,
  }});
  return journal.id;
 },{isolationLevel:"Serializable"});
}
