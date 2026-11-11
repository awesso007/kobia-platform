import {NextResponse} from "next/server";
import {z} from "zod";
import {financialOperationalSummary,linkChessFinancialEntity} from "@/lib/chess/financial-bridge";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const querySchema=z.object({
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL"]),
}).strict();
function fail(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":error instanceof z.ZodError?"Invalid input":"Request failed"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:500});
}
/** Only operational counts, never financial balances or individual payroll data. */
export async function GET(req:Request){
 try{
  const query=new URL(req.url).searchParams;
  const data=querySchema.parse({
   businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),
   service:query.get("service"),
  });
  return NextResponse.json(await financialOperationalSummary(
   data.businessId,data.clientProfileId,data.service,
  ),{headers:{"Cache-Control":"no-store"}});
 }catch(e){return fail(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json({mapping:await linkChessFinancialEntity(await req.json())},{status:201});
 }catch(e){return fail(e);}
}
