import {NextResponse} from "next/server";
import {getChessOperationsReport} from "@/lib/chess/operations-reporting";
import {assertChessRateLimit,ChessRateLimitError} from "@/lib/chess/api-rate-limit";
import {PermissionError} from "@/lib/rbac/require-permission";
import {z} from "zod";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function csvCell(input:string){
 const value=/^[=+@\-\t\r]/.test(input)?`'${input}`:input;
 return `"${value.replaceAll('"','""')}"`;
}
export async function GET(request:Request){
 try{
  const q=new URL(request.url).searchParams;
  const businessId=q.get("businessId");
  const month=q.get("month");
  const format=q.get("format")??"json";
  if(!["json","csv"].includes(format))
   return NextResponse.json({error:"Unsupported report format"},{status:400});
  await assertChessRateLimit("report_read");
  const report=await getChessOperationsReport({businessId,month});
  if(format==="json")return NextResponse.json(report,{
   headers:{"Cache-Control":"private, no-store"},
  });
  // Aggregates only; never embed client IDs or free-form task text.
  const records:[string,string,string][]=[];
  for(const item of report.caseCounts)records.push([
   "service_cases",item.service+":"+item.status,String(item.count),
  ]);
  for(const item of report.taskCounts)records.push([
   "tasks",item.status,String(item.count),
  ]);
  for(const item of report.aiReviewCounts)records.push([
   "ai_reviews",item.status,String(item.count),
  ]);
  for(const [status,count]of Object.entries(report.invoiceCountsAndAmounts)){
   records.push(["invoices:"+status,"count",String(count.invoices)]);
   records.push(["invoices:"+status,"amount_cents",count.amountCents]);
  }
  for(const item of report.regulatedCoordinationCounts)records.push([
   "regulated_coordination",item.service+":"+item.status,String(item.count),
  ]);
  for(const item of report.clientConsentCounts)records.push([
   "client_consent",item.status,String(item.count),
  ]);
  const lines=[["metric","category","value"],...records].map(
   row=>row.map(csvCell).join(",")).join("\r\n");
  return new Response(lines+"\r\n",{status:200,headers:{
   "Content-Type":"text/csv; charset=utf-8",
   "Cache-Control":"private, no-store",
   "Content-Disposition":`attachment; filename="chess-operations-${report.month}.csv"`,
   "X-Content-Type-Options":"nosniff",
  }});
 }catch(e){
  if(e instanceof ChessRateLimitError)return NextResponse.json(
   {error:"Too many requests"},{status:429,headers:{
    "Retry-After":"60","Cache-Control":"no-store",
   }});

  const status=e instanceof PermissionError?403:e instanceof z.ZodError?400:503;
  return NextResponse.json({error:status===403?"Forbidden":status===400?
   "Invalid report parameters":"Operational report unavailable"},{status});
 }
}
