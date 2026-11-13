import {NextResponse} from "next/server";
import {z} from "zod";
import {recordChessMerchantObservation} from "@/lib/chess/merchant-observations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** No Clerk session, no browser cookie or user-provided tenant header
 * can authenticate this callback. Raw-body HMAC + timestamp and the
 * resolved, exact tenant slug are all mandatory. */
export async function POST(req:Request){
 const t=new URL(req.url).searchParams.get("t")??"";
 if(!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(t)||
  Number(req.headers.get("content-length")??0)>8192)
  return NextResponse.json({error:"Forbidden"},{
   status:403,headers:{"Cache-Control":"no-store"},
  });
 try{
  const raw=await req.text();
  const result=await recordChessMerchantObservation({
   tenantSlug:t,raw,
   timestamp:req.headers.get("x-chess-merchant-timestamp"),
   signature:req.headers.get("x-chess-merchant-signature"),
  });
  return NextResponse.json(result,{
   status:result.duplicate?200:202,
   headers:{"Cache-Control":"no-store"},
  });
 }catch(error){
  return NextResponse.json({error:error instanceof z.ZodError?
   "Invalid merchant event":"Forbidden"},{
   status:error instanceof z.ZodError?400:403,
   headers:{"Cache-Control":"no-store"},
  });
 }
}
