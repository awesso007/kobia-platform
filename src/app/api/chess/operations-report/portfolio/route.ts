import {NextResponse} from "next/server";
import {z} from "zod";
import {PermissionError} from "@/lib/rbac/require-permission";
import {getChessPortfolioOperationsReport} from "@/lib/chess/operations-portfolio";

export const runtime="nodejs";
export const dynamic="force-dynamic";
function cell(raw:string){
 const safe=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""')+'"';
}
export async function GET(request:Request){
 try{
  const q=new URL(request.url).searchParams;
  const format=q.get("format")??"json";
  if(format!=="json"&&format!=="csv")
   return NextResponse.json({error:"Unsupported report format"},{status:400});
  const report=await getChessPortfolioOperationsReport(q.get("month"));
  if(format==="json")return NextResponse.json(report,{
   headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},
  });
  const rows:string[][]=[["business_id","business_name","metric","category","value"]];
  for(const b of report.businesses){
   const append=(metric:string,category:string,value:string)=>
    rows.push([b.businessId,b.businessName,metric,category,value]);
   for(const x of b.caseCounts)append("service_cases",x.service+":"+x.status,String(x.count));
   for(const x of b.taskCounts)append("tasks",x.status,String(x.count));
   for(const x of b.aiReviewCounts)append("ai_reviews",x.status,String(x.count));
   for(const [status,data] of Object.entries(b.invoiceCountsAndAmounts)){
    append("invoices:"+status,"count",String(data.invoices));
    append("invoices:"+status,"amount_cents",data.amountCents);
   }
   for(const x of b.regulatedCoordinationCounts)
    append("regulated_coordination",x.service+":"+x.status,String(x.count));
   for(const x of b.clientConsentCounts)
    append("client_consents",x.status,String(x.count));
  }
  const content=rows.map(row=>row.map(cell).join(",")).join("\r\n")+"\r\n";
  return new Response(content,{headers:{
   "Content-Type":"text/csv; charset=utf-8",
   "Content-Disposition":`attachment; filename="chess-portfolio-${report.month}.csv"`,
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
 }catch(e){
  const status=e instanceof PermissionError?403:e instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid report month":"Portfolio report unavailable"},{status,
    headers:{"Cache-Control":"private, no-store"}});
 }
}
