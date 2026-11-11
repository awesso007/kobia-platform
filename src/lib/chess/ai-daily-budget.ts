import type {PrismaClient} from "@/lib/db/generated/tenant";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {PermissionError} from "@/lib/rbac/require-permission";

export function chessAiDailyLimit(raw?:string):number{
 const value=raw===undefined||raw.trim()===""?25:Number(raw);
 if(!Number.isSafeInteger(value)||value<1||value>100)
  throw new Error("AI daily call budget requires a reviewed integer between 1 and 100.");
 return value;
}
export function chessAiUtcDay(now=new Date()):Date{
 return new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()));
}
/** Every provider invocation reserves one FULL maximum-cost call atomically.
 * Failed requests still consume quota (a safe overestimate). This is not an
 * invoice, a settlement, or independent proof of actual model charges. */
export async function claimChessAiDailyCall(
 db:PrismaClient,businessId:string,now=new Date(),
 limit=chessAiDailyLimit(process.env.CHESS_AI_DAILY_CALL_LIMIT),
){
 if(!businessId||businessId.length>128)
  throw new Error("Invalid business AI budget scope.");
 if(!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw new Error("Unsafe AI budget cap.");
 const day=chessAiUtcDay(now);
 const rows=await db.$queryRaw<Array<{callCount:number}>>`
  INSERT INTO "ChessAiUsageDaily" ("businessId","day","callCount")
  VALUES (${businessId},${day},1)
  ON CONFLICT ("businessId","day")
  DO UPDATE SET "callCount"="ChessAiUsageDaily"."callCount"+1
  WHERE "ChessAiUsageDaily"."callCount" < ${limit}
  RETURNING "callCount"
 `;
 if(rows.length!==1||!Number.isInteger(rows[0]?.callCount))
  throw new Error("Daily AI provider budget exhausted.");
 return {day,callCount:rows[0]!.callCount,limit};
}
export async function getChessAiDailyUsage(businessId:string){
 const actor=await assertBusinessManager(businessId);
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const today=chessAiUtcDay();
 const current=await db.chessAiUsageDaily.findUnique({where:{
  businessId_day:{businessId,day:today},
 },select:{callCount:true}});
 return {utcDay:today.toISOString().slice(0,10),
  reservedCalls:current?.callCount??0,
  maxCalls:chessAiDailyLimit(process.env.CHESS_AI_DAILY_CALL_LIMIT),
  maxProviderCostMicrosPerCall:5000,
  costExplanation:"Worst-case reserved provider request budget; not actual billed charges."};
}
