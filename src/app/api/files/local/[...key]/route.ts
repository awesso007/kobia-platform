import { NextResponse, type NextRequest } from "next/server";
import { readLocalObject } from "@/lib/storage/local";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import {verifyLocalDownloadCapability} from "@/lib/storage/local-capability";

export const dynamic="force-dynamic";

/** Legacy LOCAL file access is a signed, short-lived bearer capability.
 * A guessed storage key or tenant cookie is never sufficient. A READY-only
 * source SELECT and ALLOW/DENY security event share a serializable transaction.
 * For private production storage prefer versioned S3 with independent receipts.
 */
export async function GET(req:NextRequest,{params}:{params:{key:string[]}}){
 const storageKey=decodeURIComponent(params.key.join("/"));
 if(!verifyLocalDownloadCapability(
  storageKey,req.nextUrl.searchParams.get("exp"),req.nextUrl.searchParams.get("sig"),
 ))return NextResponse.json({ok:false,error:"Not found."},{status:404});
 try{
  const {db}=getTenantDb();
  const file=await db.$transaction(async tx=>{
   const record=await tx.file.findUnique({
    where:{storageKey},
    select:{id:true,name:true,mimeType:true,storageProvider:true,status:true},
   });
   const allowed=record?.storageProvider==="LOCAL"&&record.status==="READY";
   await tx.chessSecurityEvent.create({data:{
    actorClerkUserId:null,action:"HISTORICAL_LOCAL_FILE_CAPABILITY_READ",
    resourceType:"File",resourceId:record?.id??"UNKNOWN",
    decision:allowed?"ALLOW":"DENY",
   }});
   return allowed?record:null;
  },{isolationLevel:"Serializable"});
  if(!file)return NextResponse.json({ok:false,error:"Not found."},{status:404});
  const bytes=await readLocalObject(storageKey);
  if(!bytes)return NextResponse.json({ok:false,error:"Not found."},{status:404});
  const inline=req.nextUrl.searchParams.get("inline")==="1";
  const safeName=file.name.replace(/["\\\r\n]/g,"_");
  return new NextResponse(new Uint8Array(bytes),{status:200,headers:{
   "Content-Type":file.mimeType||"application/octet-stream",
   "Content-Disposition":`${inline?"inline":"attachment"}; filename="${safeName}"`,
   "Content-Length":String(bytes.length),
   "Cache-Control":"private, no-store",
   "X-Content-Type-Options":"nosniff",
   "Content-Security-Policy":"sandbox",
  }});
 }catch(err){
  if(err instanceof NoTenantError)return NextResponse.json({ok:false,error:"No tenant."},{status:403});
  return NextResponse.json({ok:false,error:"File unavailable."},{status:503});
 }
}
