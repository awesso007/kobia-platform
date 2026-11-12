import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getCurrentMembership,PermissionError} from "@/lib/rbac/require-permission";
import {invoiceSummaryGroups,reportWindow} from "./operations-reporting";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

const monthSchema=z.string().regex(/^20[2-9][0-9]-(0[1-9]|1[0-2])$/);

export function mayReadPortfolio(role:string,status:string):boolean{
 return status==="ACTIVE"&&(role==="OWNER"||role==="ADMIN");
}
export type PortfolioUnitMetrics={
 businessId:string;businessName:string;
 caseCounts:{service:string;status:string;count:number}[];
 taskCounts:{status:string;count:number}[];
 aiReviewCounts:{status:string;count:number}[];
 invoiceCountsAndAmounts:Record<string,{invoices:number;amountCents:string}>;
 regulatedCoordinationCounts:{service:string;status:string;count:number}[];
 clientConsentCounts:{status:string;count:number}[];
};
/** Operational counts only. No patient/client identities, source descriptions,
 * cash received, intercompany eliminations or statutory consolidation. */
export function portfolioTotals(units:readonly PortfolioUnitMetrics[]){
 let cases=0,tasks=0,aiReviews=0,regulated=0,consents=0,invoices=0;
 let invoiceAmountCents=0n;
 for(const unit of units){
  cases+=unit.caseCounts.reduce((n,x)=>n+x.count,0);
  tasks+=unit.taskCounts.reduce((n,x)=>n+x.count,0);
  aiReviews+=unit.aiReviewCounts.reduce((n,x)=>n+x.count,0);
  regulated+=unit.regulatedCoordinationCounts.reduce((n,x)=>n+x.count,0);
  consents+=unit.clientConsentCounts.reduce((n,x)=>n+x.count,0);
  for(const value of Object.values(unit.invoiceCountsAndAmounts)){
   invoices+=value.invoices;
   invoiceAmountCents+=BigInt(value.amountCents);
  }
 }
 return {cases,tasks,aiReviews,regulated,consents,invoices,
  invoiceAmountCents:invoiceAmountCents.toString()};
}
/** Single-tenant portfolio visibility is reserved for an ACTIVE owner/admin.
 * Every query is limited to the currently active units in the resolved tenant
 * schema. Never query, join or merge another tenant's database. */
export async function getChessPortfolioOperationsReport(input:unknown){
 const month=monthSchema.parse(input);
 const actor=await getCurrentMembership();
 if(!actor||!mayReadPortfolio(actor.role,actor.status))
  throw new PermissionError("record:read");
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:actor.clerkUserId,action:"OPERATIONS_PORTFOLIO_READ",
  resourceType:"ChessOperationsPortfolio",resourceId:month,
 },async tx=>{
  // Recheck active owner/admin membership inside the read/audit transaction.
  const live=await tx.membership.findUnique({
   where:{clerkUserId:actor.clerkUserId},select:{role:true,status:true},
  });
  if(!live||!mayReadPortfolio(live.role,live.status))return null;
  const units=await tx.chessBusinessUnit.findMany({where:{status:"ACTIVE"},
  select:{id:true,name:true},orderBy:{name:"asc"},take:101});
 // Never return a misleading, silently truncated report.
 if(units.length>100)throw new Error("Portfolio exceeds report unit cap.");
 const {from,to}=reportWindow(month);
 const createdAt={gte:from,lt:to};
 const businessId={in:units.map(x=>x.id)};
 const [cases,tasks,ai,invoices,regulated,consents]=await Promise.all([
  tx.chessServiceCase.groupBy({by:["businessId","service","status"],
   where:{businessId,createdAt},_count:{_all:true}}),
  tx.chessWorkItem.groupBy({by:["businessId","status"],
   where:{businessId,createdAt},_count:{_all:true}}),
  tx.chessAiSuggestion.groupBy({by:["businessId","status"],
   where:{businessId,createdAt},_count:{_all:true}}),
  tx.chessBillingInvoice.groupBy({by:["businessId","status"],
   where:{businessId,createdAt},_count:{_all:true},
   _sum:{amountCents:true}}),
  tx.chessRegulatedWorkflow.groupBy({by:["businessId","service","status"],
   where:{businessId,createdAt},_count:{_all:true}}),
  tx.chessClientConsent.groupBy({by:["businessId","status"],
   where:{businessId,createdAt},_count:{_all:true}}),
 ]);
 const businesses:PortfolioUnitMetrics[]=units.map(unit=>({
  businessId:unit.id,businessName:unit.name,
  caseCounts:cases.filter(x=>x.businessId===unit.id).map(x=>({
   service:x.service,status:x.status,count:x._count._all,
  })),
  taskCounts:tasks.filter(x=>x.businessId===unit.id).map(x=>({
   status:x.status,count:x._count._all,
  })),
  aiReviewCounts:ai.filter(x=>x.businessId===unit.id).map(x=>({
   status:x.status,count:x._count._all,
  })),
  invoiceCountsAndAmounts:invoiceSummaryGroups(
   invoices.filter(x=>x.businessId===unit.id)),
  regulatedCoordinationCounts:regulated.filter(x=>x.businessId===unit.id)
   .map(x=>({service:x.service,status:x.status,count:x._count._all})),
  clientConsentCounts:consents.filter(x=>x.businessId===unit.id)
   .map(x=>({status:x.status,count:x._count._all})),
 }));
 return {month,scope:"CURRENT_TENANT_ACTIVE_BUSINESS_UNITS" as const,
  range:{from:from.toISOString(),toExclusive:to.toISOString()},
  businessCount:businesses.length,businesses,
  totals:portfolioTotals(businesses),
  notes:[
   "Counts cover records created in the UTC month and CURRENT workflow statuses.",
   "Invoice amounts are proposed invoice face values, not collected cash or GL revenue.",
   "Each business remains separate. Cross-entity eliminations and statutory consolidation are excluded.",
   "No client, account, property, health, tax-return or payroll detail is returned.",
  ]};
 });
}
