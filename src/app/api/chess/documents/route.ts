import {NextResponse} from "next/server";
import {z} from "zod";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import {initiateChessDocumentUpload,confirmChessDocumentUpload,getChessDocumentDownload} from "@/lib/chess/documents";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
const confirmation=z.object({
 documentId:z.string().min(1).max(128),
 businessId:z.string().min(1).max(128),
 clientProfileId:z.string().min(1).max(128),
 service:z.enum(["ACCOUNTING","BOOKKEEPING","PAYROLL","TAX","MORTGAGE","INSURANCE","REAL_ESTATE","INVESTMENTS"]),
}).strict();
function failure(error:unknown){
 return NextResponse.json({error:error instanceof PermissionError?"Forbidden":error instanceof z.ZodError?"Invalid input":"Request failed"},
  {status:error instanceof PermissionError?403:error instanceof z.ZodError?400:503});
}
export async function POST(req:Request){
 try{
  assertMutationOrigin(req);
  return NextResponse.json(await initiateChessDocumentUpload(await req.json()),{status:201});
 }catch(e){return failure(e);}
}
export async function PATCH(req:Request){
 try{
  assertMutationOrigin(req);
  const data=confirmation.parse(await req.json());
  return NextResponse.json(await confirmChessDocumentUpload(data.documentId,data.businessId,data.clientProfileId,data.service));
 }catch(e){return failure(e);}
}

export async function GET(req:Request) {
 try {
  const query=new URL(req.url).searchParams;
  const data=confirmation.parse({
   documentId:query.get("documentId"),businessId:query.get("businessId"),
   clientProfileId:query.get("clientProfileId"),service:query.get("service"),
  });
  return NextResponse.json(await getChessDocumentDownload(
   data.documentId,data.businessId,data.clientProfileId,data.service,
  ),{headers:{"Cache-Control":"no-store"}});
 } catch(e){return failure(e);}
}
