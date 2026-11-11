import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
import {snapshotChessOperations,reviewChessOperationsSnapshot,
 getChessOperationalSnapshotEvidence} from "@/lib/chess/operational-close";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
function failure(error:unknown){
 const status=error instanceof ChessRateLimitError?429:
  error instanceof PermissionError?403:
  error instanceof z.ZodError?400:503;
 return NextResponse.json({error:status===429?"Too many requests":
  status===403?"Forbidden":status===400?"Invalid request":
  "Operational snapshot unavailable"},{
  status,headers:{...noStore,...(status===429?{"Retry-After":"60"}:{})},
 });
}
export async function GET(req:Request){
 try{
  await assertChessRateLimit("report_read");
  const url=new URL(req.url);
  const businessId=z.string().min(1).max(128).parse(url.searchParams.get("businessId"));
  const month=z.string().regex(/^20[2-9][0-9]-(0[1-9]|1[0-2])$/)
   .parse(url.searchParams.get("month"));
  const snapshot=await getChessOperationalSnapshotEvidence(businessId,month);
  return NextResponse.json(snapshot??{error:"Not found"},{
   status:snapshot?200:404,headers:noStore,
  });
 }catch(e){return failure(e);}
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await snapshotChessOperations(await req.json()),{
   status:201,headers:noStore,
  });
 }catch(e){return failure(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  await assertChessRateLimit("billing_write");
  return NextResponse.json(await reviewChessOperationsSnapshot(await req.json()),{
   headers:noStore,
  });
 }catch(e){return failure(e);}
}
