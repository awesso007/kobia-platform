/**
 * Prisma selector for tRPC routers and their bank-reconciliation helpers.
 * Outside an authenticated protected query, return the unchanged full client.
 * Within a protected query, bind ALL selectors to the transaction used by
 * the role recheck and audit. No nested transactions or writes are allowed.
 */
import { db as rawDb } from "@/lib/db";
import { currentLegacyTrpcReadScope, HistoricalTrpcReadScopeError } from "./trpc-read-scope";
const MUTATIONS=new Set(["create","createMany","createManyAndReturn","update",
 "updateMany","updateManyAndReturn","delete","deleteMany","upsert"]);
const READS=new Set(["findFirst","findFirstOrThrow","findUnique","findUniqueOrThrow",
 "findMany","count","aggregate","groupBy"]);
function delegateProxy<T extends object>(delegate:T):T{
 return new Proxy(delegate,{
  get(target,method){
   const checked=currentLegacyTrpcReadScope();
   if(typeof method==="string"&&MUTATIONS.has(method)&&checked?.mode!=="mutation")
    throw new HistoricalTrpcReadScopeError("Write operation prohibited in audited query");
   const value=Reflect.get(target,method,target);
   if(typeof value==="function"){
    return (...args:unknown[])=>{
     const scope=currentLegacyTrpcReadScope();
     if(!scope)throw new HistoricalTrpcReadScopeError("Leaked query delegate");
     if(typeof method==="string"&&(READS.has(method)||MUTATIONS.has(method)))scope.accesses++;
     return Reflect.apply(value,target,args);
    };
   }
   return value;
  },
 }) as T;
}
export function createLegacyTrpcReadDbProxy<T extends object>(client:T):T{
 return new Proxy(client,{
  get(target,property){
   const scope=currentLegacyTrpcReadScope();
   const source=scope?.tx??target;
   if(scope&&property==="$transaction")
    throw new HistoricalTrpcReadScopeError("Nested legacy Prisma transaction prohibited");
   if(scope&&typeof property==="string"&&
      ["$executeRaw","$executeRawUnsafe","$queryRawUnsafe"].includes(property))
    throw new HistoricalTrpcReadScopeError("Unsafe legacy SQL prohibited");
   const value=Reflect.get(source,property,source);
   if(typeof value==="function")return (...args:unknown[])=>{
    if(scope&&property==="$queryRaw")scope.accesses++;
    return Reflect.apply(value,source,args);
   };
   if(scope&&value&&typeof value==="object"&&
      ("findMany" in value||"findUnique" in value))
    return delegateProxy(value);
   return value;
  },
 }) as T;
}
export const db=createLegacyTrpcReadDbProxy(rawDb);
