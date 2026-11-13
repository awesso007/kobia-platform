import {NextResponse} from "next/server";
import {z} from "zod";
import {assertAuthorizedWorkflowTenant} from "@/lib/chess/worker-authorization";
import {authorizedDocumentPurgeWorker,runChessDocumentPurge} from "@/lib/chess/document-purge";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const input=z.object({limit:z.number().int().min(1).max(25).default(10)}).strict();
/** Vault-held token + explicitly configured tenant + four release gates.
 * An operator cannot pass a document ID to purge a different tenant. */
export async function POST(request:Request){
 const token=(request.headers.get("authorization")??"").replace(/^Bearer /,"");
 if(!authorizedDocumentPurgeWorker(token))
  return NextResponse.json({error:"Forbidden"},{status:403,
   headers:{"Cache-Control":"no-store"}});
 try{
  assertAuthorizedWorkflowTenant(false);
  const data=input.parse(await request.json());
  const report=await runChessDocumentPurge(data.limit);
  if(report.disabled)return NextResponse.json({error:"Document purge disabled"},
   {status:503,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json(report,{headers:{"Cache-Control":"no-store"}});
 }catch(error){
  return NextResponse.json({error:error instanceof z.ZodError?
   "Invalid request":"Document purge unavailable"},{
    status:error instanceof z.ZodError?400:503,
    headers:{"Cache-Control":"no-store"},
  });
 }
}
