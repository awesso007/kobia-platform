import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { verifySharePassword, fileDownloadUrl } from "@/lib/files/files";

export const dynamic = "force-dynamic";

/*
 * Public share-link download (Sprint 8). NO requirePermission - the slug is the
 * capability. Validates the link is not expired and not over its max-download
 * cap, checks the optional password, increments downloadCount, then 302s to the
 * storage download URL (presigned S3 GET or the LOCAL serve route).
 *
 * Tenant is resolved from a validated `?t=<slug>` query param (the public-form
 * convention). The share slug itself is unique only within a tenant schema.
 */
function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const tParam = req.nextUrl.searchParams.get("t");
  const tenantSlug = sanitizeSlug(tParam);
  if (!tenantSlug) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  let db;
  try {
    db = getTenantPrisma(schemaNameForSlug(tenantSlug));
  } catch {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  // A public capability is not a generic read permission. Validate the
  // link, consume its quota and commit a privacy-minimal audit together.
  // The authorization never depends solely on knowing a storage key.
  let granted;
  try {
    granted=await db.$transaction(async tx=>{
      const link=await tx.fileShareLink.findUnique({
        where:{slug:params.slug},include:{file:true},
      });
      const now=Date.now();
      let status=404;
      let allowed=!!link?.file && link.file.status==="READY";
      if(allowed&&link?.expiresAt&&link.expiresAt.getTime()<now){
        allowed=false;status=410;
      }
      if(allowed&&link?.maxDownloads!==null&&link?.maxDownloads!==undefined&&
         link.downloadCount>=link.maxDownloads){
        allowed=false;status=410;
      }
      if(allowed&&link?.password){
        const provided=req.nextUrl.searchParams.get("password")??"";
        if(!provided||!verifySharePassword(provided,link.password)){
          allowed=false;status=401;
        }
      }
      if(allowed&&link){
        // Conditional write plus SERIALIZABLE ensures concurrent requests
        // never consume more than the configured download cap.
        const updated=await tx.fileShareLink.updateMany({
          where:{
            id:link.id,
            ...(link.maxDownloads!==null?{
              downloadCount:{lt:link.maxDownloads},
            }:{}),
          },
          data:{downloadCount:{increment:1}},
        });
        if(updated.count!==1){allowed=false;status=410;}
      }
      await tx.chessSecurityEvent.create({data:{
        actorClerkUserId:null,action:"HISTORICAL_PUBLIC_FILE_SHARE_READ",
        resourceType:"File",resourceId:link?.file?.id??"UNKNOWN",
        decision:allowed?"ALLOW":"DENY",
      }});
      return allowed&&link?.file?{file:link.file,status:200}:{file:null,status};
    },{isolationLevel:"Serializable"});
  }catch{
    return NextResponse.json({ok:false,error:"Share unavailable."},{status:503});
  }
  if(!granted.file){
    return NextResponse.json({ok:false,error:"Share unavailable."},{
      status:granted.status,
    });
  }

  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const url = await fileDownloadUrl(granted.file, { inline, expiresIn: 60 });
  const absolute = url.startsWith("http") ? url : new URL(url, req.nextUrl.origin).toString();
  const response=NextResponse.redirect(absolute,302);
  response.headers.set("Cache-Control","private, no-store");
  response.headers.set("X-Content-Type-Options","nosniff");
  return response;
}
