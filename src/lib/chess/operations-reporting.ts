import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {assertBusinessManager} from "./business-manager";
import {PermissionError} from "@/lib/rbac/require-permission";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

const periodInput=z.object({
 businessId:z.string().min(1).max(128),
 month:z.string().regex(/^20[2-9][0-9]-(0[1-9]|1[0-2])$/),
}).strict();
export function reportWindow(month:string){
 const valid=z.string().regex(/^20[2-9][0-9]-(0[1-9]|1[0-2])$/).parse(month);
 const [year,mon]=valid.split("-").map(Number);
 const from=new Date(Date.UTC(year!,mon!-1,1));
 const to=new Date(Date.UTC(year!,mon!,1));
 return {from,to};
}
export function invoiceSummaryGroups(rows:readonly {
 status:string;_count:{_all:number};_sum:{amountCents:bigint|null};
}[]){
 const totals:Record<string,{invoices:number;amountCents:string}>={};
 for(const row of rows)totals[row.status]={
  invoices:row._count._all,
  amountCents:(row._sum.amountCents??0n).toString(),
 };
 return totals;
}
/** Business-scoped operational report, no client identities or sensitive
 * descriptions. Invoice SENT is vendor acknowledgement, NOT cash received.
 * These metrics are not a consolidated GL, statutory revenue or tax return. */
export async function getChessOperationsReport(input:unknown){
 const {businessId,month}=periodInput.parse(input);
 const manager=await assertBusinessManager(businessId);
 if(!["OWNER","ADMIN"].includes(manager.role))throw new PermissionError("record:read");
 const {db,tenantId}=getTenantDb();
 const {from,to}=reportWindow(month);
 const period={gte:from,lt:to};
 return auditedChessSensitiveRead(db,{
  businessId,actorClerkUserId:manager.clerkUserId,
  action:"OPERATIONS_REPORT_READ",resourceType:"ChessOperationsReport",
  resourceId:month,
 },async tx=>{
  const current=await tx.membership.findUnique({
   where:{clerkUserId:manager.clerkUserId},
   select:{status:true,role:true},
  });
  if(current?.status!=="ACTIVE"||
   !["OWNER","ADMIN"].includes(current.role))return null;
 const [unit,cases,workItems,ai,invoices,regulated,consents]=await Promise.all([
  tx.chessBusinessUnit.findFirst({where:{id:businessId,status:"ACTIVE"},
   select:{id:true,name:true}}),
  tx.chessServiceCase.groupBy({by:["service","status"],
   where:{businessId,createdAt:period},_count:{_all:true}}),
  tx.chessWorkItem.groupBy({by:["status"],
   where:{businessId,createdAt:period},_count:{_all:true}}),
  tx.chessAiSuggestion.groupBy({by:["status"],
   where:{businessId,createdAt:period},_count:{_all:true}}),
  tx.chessBillingInvoice.groupBy({by:["status"],
   where:{businessId,createdAt:period},_count:{_all:true},
   _sum:{amountCents:true}}),
  tx.chessRegulatedWorkflow.groupBy({by:["service","status"],
   where:{businessId,createdAt:period},_count:{_all:true}}),
  tx.chessClientConsent.groupBy({by:["status"],
   where:{businessId,createdAt:period},_count:{_all:true}}),
 ]);
 if(!unit)return null;
 return {
  tenantSlug:tenantId,businessId:unit.id,businessName:unit.name,
  month,range:{from:from.toISOString(),toExclusive:to.toISOString()},
  caseCounts:cases.map(x=>({service:x.service,status:x.status,count:x._count._all})),
  taskCounts:workItems.map(x=>({status:x.status,count:x._count._all})),
  aiReviewCounts:ai.map(x=>({status:x.status,count:x._count._all})),
  invoiceCountsAndAmounts:invoiceSummaryGroups(invoices),
  regulatedCoordinationCounts:regulated.map(x=>({
   service:x.service,status:x.status,count:x._count._all,
  })),
  clientConsentCounts:consents.map(x=>({status:x.status,count:x._count._all})),
  notes:[
   "Counts cover records created in the specified UTC month, grouped by CURRENT workflow status.",
   "Invoice totals are amounts proposed and sent, not recognized revenue or settled cash.",
   "Cross-business accounting eliminations, provider payments and statutory reports are excluded.",
   "No client, account, property, health, payroll or tax-return details are included.",
  ],
 };
 });
}
