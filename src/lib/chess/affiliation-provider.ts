import {z} from "zod";

const response=z.object({
 practitionerRegistryId:z.string().min(2).max(128),
 firmRegistryId:z.string().min(2).max(128),
 service:z.enum(["MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
 jurisdiction:z.string().min(2).max(30),
 status:z.enum(["ACTIVE","INACTIVE","REVOKED","SUSPENDED","UNKNOWN"]),
 checkedAt:z.string().datetime(),
 expiresAt:z.string().datetime().nullable(),
 sourceUrl:z.string().url(),
}).strict();
export type AffiliationEvidence=z.infer<typeof response>;
export function affiliationProviderConfigured():boolean{
 if(process.env.CHESS_AFFILIATION_VERIFICATION_ENABLED!=="true")return false;
 const raw=process.env.CHESS_AFFILIATION_API_URL;
 const host=process.env.CHESS_AFFILIATION_ALLOWED_HOST;
 const token=process.env.CHESS_AFFILIATION_API_KEY;
 if(!raw||!host||!token)return false;
 try{
  const url=new URL(raw);
  return url.protocol==="https:"&&url.hostname===host&&
   !url.username&&!url.password&&!url.hash;
 }catch{return false;}
}
export function validAffiliationEvidence(raw:unknown,expected:{
 practitionerRegistryId:string;firmRegistryId:string;service:string;jurisdiction:string;
},now=new Date()):AffiliationEvidence|null{
 const parsed=response.safeParse(raw);
 if(!parsed.success)return null;
 const evidence=parsed.data;
 const allow=(process.env.CHESS_AFFILIATION_SOURCE_HOSTS??"")
  .split(",").map(s=>s.trim()).filter(Boolean);
 let source:URL;
 try{source=new URL(evidence.sourceUrl);}catch{return null;}
 const date=new Date(evidence.checkedAt);
 const expiry=evidence.expiresAt?new Date(evidence.expiresAt):null;
 if(evidence.practitionerRegistryId!==expected.practitionerRegistryId||
  evidence.firmRegistryId!==expected.firmRegistryId||
  evidence.service!==expected.service||
  evidence.jurisdiction.toUpperCase()!==expected.jurisdiction.toUpperCase()||
  evidence.status!=="ACTIVE"||source.protocol!=="https:"||
  source.username||source.password||!allow.includes(source.hostname)||
  !Number.isFinite(date.getTime())||date>now||
  now.getTime()-date.getTime()>24*60*60_000||
  (expiry!==null&&expiry<=now))return null;
 return evidence;
}
/** Gateway must use official registry evidence and confirm active association
 * of both individual and firm. It cannot substitute manual user attestation. */
export async function verifyAffiliationWithProvider(input:{
 practitionerRegistryId:string;firmRegistryId:string;service:string;jurisdiction:string;
}):Promise<AffiliationEvidence|null>{
 if(!affiliationProviderConfigured())throw new Error("Affiliation registry is disabled.");
 const responseRaw=await fetch(process.env.CHESS_AFFILIATION_API_URL!,{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{"Authorization":`Bearer ${process.env.CHESS_AFFILIATION_API_KEY!}`,
   "Content-Type":"application/json"},
  body:JSON.stringify(input),signal:AbortSignal.timeout(12000),
 });
 if(!responseRaw.ok)throw new Error("Affiliation registry lookup unavailable.");
 return validAffiliationEvidence(await responseRaw.json(),input);
}
