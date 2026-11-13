/**
 * Scope protected legacy-ledger tRPC query resolvers to ONE transaction.
 * The principal, tenant, query SELECT and AuditLog are committed together.
 * Mutation procedures run outside this read-only scope and are unchanged.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
type LegacyScope={
 readonly tenantId:string;readonly userId:string;
 readonly tx:Prisma.TransactionClient;
 readonly mode:"query"|"mutation";
 accesses:number;closed:boolean;
};
const storage=new AsyncLocalStorage<LegacyScope>();
export class HistoricalTrpcReadScopeError extends Error{
 constructor(message="Protected legacy query transaction unavailable"){
  super(message);this.name="HistoricalTrpcReadScopeError";
 }
}
export function currentLegacyTrpcReadScope():LegacyScope|null{
 const s=storage.getStore();
 if(!s)return null;
 if(s.closed)throw new HistoricalTrpcReadScopeError("Closed legacy query transaction");
 return s;
}
export async function withLegacyTrpcReadScope<T>(
 input:{tenantId:string;userId:string;tx:Prisma.TransactionClient},
 fn:(scope:LegacyScope)=>Promise<T>,
):Promise<T>{
 if(!input.tenantId||!input.userId||storage.getStore())
  throw new HistoricalTrpcReadScopeError("Invalid or nested legacy query");
 const scope:LegacyScope={...input,mode:"query",accesses:0,closed:false};
 return storage.run(scope,async()=>{
  try{return await fn(scope)}
  finally{scope.closed=true}
 });
}

/** Round 57: exactly one mutable legacy-ledger DB transaction per procedure.
 * Recheck ACTIVE tenant+membership and audit before it can commit. */
export async function withLegacyTrpcMutationScope<T>(
 input:{tenantId:string;userId:string;tx:Prisma.TransactionClient},
 fn:(scope:LegacyScope)=>Promise<T>,
):Promise<T>{
 if(!input.tenantId||!input.userId||storage.getStore())
  throw new HistoricalTrpcReadScopeError("Invalid or nested legacy mutation");
 const scope:LegacyScope={...input,mode:"mutation",accesses:0,closed:false};
 return storage.run(scope,async()=>{
  try{return await fn(scope)}
  finally{scope.closed=true}
 });
}
