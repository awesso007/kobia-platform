import {createHash} from "node:crypto";
import type {PrismaClient} from "@/lib/db/generated/tenant";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";

/** Each active tenant schema has its own atomic window counters. These are
 * deliberately stricter for remote financial/AI submissions than reports. */
export const chessRatePolicies={
 portfolio_read:{perUser:12,perTenant:90},
 report_read:{perUser:30,perTenant:200},
 billing_read:{perUser:30,perTenant:150},
 billing_write:{perUser:12,perTenant:60},
 billing_delivery:{perUser:6,perTenant:30},
 ai_read:{perUser:30,perTenant:150},
 ai_suggest:{perUser:6,perTenant:30},
 ai_review:{perUser:12,perTenant:60},
} as const;
export type ChessRateScope=keyof typeof chessRatePolicies;
export class ChessRateLimitError extends Error{
 readonly status=429;
 readonly retryAfterSeconds=60;
 constructor(){super("CHESS request quota exceeded");this.name="ChessRateLimitError";}
}
export function chessRateWindow(now:Date):Date{
 return new Date(Math.floor(now.getTime()/60_000)*60_000);
}
export function chessRateSubject(kind:"tenant"|"user",tenant:string,identity:string):string{
 return createHash("sha256").update(JSON.stringify({
  policy:"CHESS_RATE_WINDOW_V1",kind,tenant,identity,
 })).digest("hex");
}
/** Serializable per-key increments performed in one PostgreSQL transaction.
 * Quota violation rolls back both increments. A broken or missing database
 * table rejects the request instead of silently disabling protection. */
export async function claimChessRateWindow(
 db:PrismaClient,scope:ChessRateScope,tenantSlug:string,clerkUserId:string,
 now=new Date(),
){
 const policy=chessRatePolicies[scope];
 const windowStart=chessRateWindow(now);
 const recipients=[
  {digest:chessRateSubject("tenant",tenantSlug,tenantSlug),limit:policy.perTenant},
  {digest:chessRateSubject("user",tenantSlug,clerkUserId),limit:policy.perUser},
 ];
 await db.$transaction(async tx=>{
  for(const subject of recipients){
   const result=await tx.$queryRaw<Array<{hits:number}>>`
    INSERT INTO "ChessRequestRateWindow" ("scope","subjectDigest","windowStart","hits")
    VALUES (${scope},${subject.digest},${windowStart},1)
    ON CONFLICT ("scope","subjectDigest","windowStart")
    DO UPDATE SET "hits" = "ChessRequestRateWindow"."hits" + 1
    RETURNING "hits"
   `;
   if(result.length!==1||result[0]!.hits>subject.limit)
    throw new ChessRateLimitError();
  }
 });
}
export async function assertChessRateLimit(scope:ChessRateScope):Promise<void>{
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE")throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 await claimChessRateWindow(db,scope,tenantId,actor.clerkUserId);
}
/** Bounded retention work on the existing private, allowlisted scheduler.
 * No identifiers or client data are returned by the cleanup. */
export async function pruneOldChessRateWindows(now=new Date()):Promise<number>{
 const {db}=getTenantDb();
 const cutoff=new Date(now.getTime()-7*24*60*60*1000);
 return db.$executeRaw`
  WITH old AS (
   SELECT ctid FROM "ChessRequestRateWindow"
   WHERE "windowStart" < ${cutoff} ORDER BY "windowStart" LIMIT 500
  )
  DELETE FROM "ChessRequestRateWindow" AS target
  USING old WHERE target.ctid=old.ctid
 `;
}
