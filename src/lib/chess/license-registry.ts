import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {assertBusinessAccess} from "./business-units";

const result=z.object({
 registryId:z.string().min(1),
 service:z.enum(["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 jurisdiction:z.string().min(2),
 status:z.enum(["ACTIVE","INACTIVE","EXPIRED","SUSPENDED","UNKNOWN"]),
 expiresAt:z.string().datetime().nullable(),
 sourceUrl:z.string().url(),
 checkedAt:z.string().datetime(),
}).strict();

export function licenseRegistryConfigured():boolean {
 const base=process.env.CHESS_LICENSE_API_URL;
 const host=process.env.CHESS_LICENSE_ALLOWED_HOST;
 const key=process.env.CHESS_LICENSE_API_KEY;
 if(!base||!host||!key)return false;
 try {
  const url=new URL(base);
  return url.protocol==="https:" && url.hostname===host &&
   !url.username && !url.password && !url.hash && !url.port;
 }catch{return false;}
}

export function isAuthoritativeRegistryResponse(
 raw:unknown,expected:{registryId:string;service:string;jurisdiction:string},
 now=new Date(),
):boolean {
 const parsed=result.safeParse(raw);
 if(!parsed.success)return false;
 const data=parsed.data;
 const allow=(process.env.CHESS_LICENSE_SOURCE_HOSTS??"").split(",").map(x=>x.trim()).filter(Boolean);
 let source:URL;
 try{source=new URL(data.sourceUrl);}catch{return false;}
 const checkedAt=new Date(data.checkedAt);
 if(!allow.includes(source.hostname) || source.protocol!=="https:" || source.port ||
  data.registryId!==expected.registryId || data.service!==expected.service ||
  data.jurisdiction.toUpperCase()!==expected.jurisdiction.toUpperCase() ||
  data.status!=="ACTIVE" ||
  checkedAt.getTime()>now.getTime() ||
  now.getTime()-checkedAt.getTime()>24*60*60*1000)return false;
 if(data.expiresAt && new Date(data.expiresAt)<=now)return false;
 return true;
}

const verifyRequest=z.object({credentialId:z.string().min(1).max(128),businessId:z.string().min(1).max(128)}).strict();

/** Official verification adapter. The configured vendor must be authorized to
 * redistribute registry information, and provider credentials must be private.
 * Only an independent business admin may initiate verification. */
export async function verifyChessPractitionerCredential(input:unknown){
 const data=verifyRequest.parse(input);
 await assertBusinessAccess(data.businessId);
 const actor=await getCurrentMembership();
 if(!actor || !["OWNER","ADMIN"].includes(actor.role))throw new PermissionError("record:update");
 const {db}=getTenantDb();
 const credential=await db.chessPractitionerCredential.findFirst({
  where:{id:data.credentialId,businessId:data.businessId},
 });
 if(!credential||credential.clerkUserId===actor.clerkUserId||!credential.credentialRegistryId)
  throw new PermissionError("record:update");
 if(!licenseRegistryConfigured())throw new Error("License registry adapter not configured.");
 const url=new URL(process.env.CHESS_LICENSE_API_URL!);
 // Registered endpoint is immutable; no user-controlled network URL.
 const response=await fetch(url.toString(),{
  method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(12000),
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_LICENSE_API_KEY!}`,
   "Content-Type":"application/json",
  },
  body:JSON.stringify({
   registryId:credential.credentialRegistryId,
   service:credential.service,jurisdiction:credential.jurisdiction,
  }),
 });
 if(!response.ok)throw new Error(`Registry HTTP ${response.status}`);
 const raw:unknown=await response.json();
 const valid=isAuthoritativeRegistryResponse(raw,{
  registryId:credential.credentialRegistryId,
  service:credential.service,jurisdiction:credential.jurisdiction,
 });
 const checkedAt=new Date();
 const dataUpdate={
  status:valid?"VERIFIED" as const:"UNVERIFIED" as const,
  verifiedAt:valid?checkedAt:null,
  verifiedByClerkUserId:valid?actor.clerkUserId:null,
  verificationSource:valid?(raw as z.infer<typeof result>).sourceUrl:null,
  registryCheckedAt:valid?new Date((raw as z.infer<typeof result>).checkedAt):checkedAt,
  expiresAt:valid && (raw as z.infer<typeof result>).expiresAt
   ?new Date((raw as z.infer<typeof result>).expiresAt!):null,
 };
 await db.$transaction(async tx=>{
  await tx.chessPractitionerCredential.update({where:{id:credential.id},data:dataUpdate});
  await tx.chessSecurityEvent.create({data:{
   businessId:data.businessId,actorClerkUserId:actor.clerkUserId,
   action:"LICENSE_REGISTRY_CHECK",resourceType:"ChessPractitionerCredential",
   resourceId:credential.id,decision:valid?"ALLOW":"DENY",
  }});
 });
 return {verified:valid,credentialId:credential.id};
}


/** Registry checks are admin-only and must never expose raw credential
 * documents or provider tokens in employee responses. */
export async function listChessLicensesForReview(businessId:string){
 const id=z.string().min(1).max(128).parse(businessId);
 await assertBusinessAccess(id);
 const actor=await getCurrentMembership();
 if(!actor||actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 const records=await db.chessPractitionerCredential.findMany({
  where:{businessId:id},orderBy:{updatedAt:"desc"},take:100,
  select:{id:true,clerkUserId:true,service:true,credentialType:true,
   jurisdiction:true,status:true,verifiedAt:true,registryCheckedAt:true,
   expiresAt:true,credentialRegistryId:true},
 });
 return {records,viewerId:actor.clerkUserId,
  registryConfigured:licenseRegistryConfigured()};
}
