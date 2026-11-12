import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {auditedChessManagerRead} from "./sensitive-read-audit";
import type {ChessFinancialAttemptState} from "./bank-financial-attempt";

export const financialAttemptStates=[
 "RESERVED","EXECUTING","UNKNOWN","COMMITTED","FAILED","CANCELLED",
] as const satisfies readonly ChessFinancialAttemptState[];

/** A status count is NOT a bank balance, matching result or settled payment. */
export function financialAttemptCounts(
 rows:readonly {status:ChessFinancialAttemptState;_count:{_all:number}}[],
):Record<ChessFinancialAttemptState,number>{
 const output=Object.fromEntries(financialAttemptStates.map(s=>[s,0])) as
  Record<ChessFinancialAttemptState,number>;
 for(const row of rows)output[row.status]=row._count._all;
 return output;
}

/**
 * Privacy-minimal, business-scoped financial exception dashboard.
 * No client identity, account, amount, consent, GL source ID or provider
 * receipt is returned. The role/business recheck and audit are transaction
 * coupled. This is observation ONLY: never resolve or retry UNKNOWN writes.
 */
export async function getChessFinancialAttemptHealth(businessId:string){
 const actor=await assertBusinessManager(businessId);
 const {db}=getTenantDb();
 return auditedChessManagerRead(db,{
  businessId,actorClerkUserId:actor.clerkUserId,
  action:"FINANCIAL_ATTEMPT_HEALTH_READ",
  resourceType:"ChessFinancialAttempt",
  resourceId:"business:"+businessId,
 },async tx=>{
  const [groups,oldestUnconfirmed,recent]=await Promise.all([
   tx.chessFinancialAttempt.groupBy({
    by:["status"],where:{businessId},
    _count:{_all:true},
   }),
   tx.chessFinancialAttempt.findFirst({
    where:{businessId,status:{in:["EXECUTING","UNKNOWN"]}},
    orderBy:{reservedAt:"asc"},
    select:{reservedAt:true},
   }),
   tx.chessFinancialAttempt.findMany({
    where:{businessId},
    orderBy:{reservedAt:"desc"},take:25,
    select:{status:true,reservedAt:true,updatedAt:true},
   }),
  ]);
  return {
   counts:financialAttemptCounts(groups),
   oldestUnconfirmedAt:oldestUnconfirmed?.reservedAt??null,
   recent,
  };
 });
}
