import type {Prisma,PrismaClient} from "@/lib/db/generated/tenant";
import {PermissionError} from "@/lib/rbac/require-permission";

type SensitiveReadContext={
 businessId?:string;actorClerkUserId:string;
 action:"REGULATED_WORKFLOW_READ"|"BANK_REVIEW_DETAILS_READ"|"OPERATIONS_PORTFOLIO_READ"|"SECURITY_OPERATIONS_READ"|"DOCUMENT_LIST_READ"|"DOCUMENT_DOWNLOAD_ROUTE_ISSUED"|"DOCUMENT_DOWNLOAD_READ"|"DOCUMENT_REDACTION_REVIEW_CONTENT_READ"|"OPERATIONS_REPORT_READ"|"BANK_CANDIDATES_READ"|"PAYROLL_DISPATCH_READ"|"BANK_POSTING_RECONCILIATION_READ"|"CLIENT_PROFILE_DIRECTORY_READ"|"CLIENT_PROFILE_DETAIL_READ"|"CLIENT_PROVISIONING_READ"|"APPOINTMENT_DIRECTORY_READ"|"MANAGER_WORK_QUEUE_READ"|"EMPLOYEE_WORK_ITEMS_READ"|"TAX_WORKPAPER_DIRECTORY_READ"|"BILLING_INVOICE_DIRECTORY_READ"|"BILLABLE_CASE_DIRECTORY_READ"|"APPOINTMENT_CALENDAR_READ"|"EMPLOYEE_ROSTER_READ"|"RECURRING_WORK_DIRECTORY_READ"|"EMPLOYEE_ALERTS_READ"|"FINANCIAL_ATTEMPT_HEALTH_READ"|"CLIENT_CONSENT_DIRECTORY_READ"|"CLIENT_CONSENT_DISCLOSURE_READ"|"WORKER_HEALTH_READ"|"AI_TRIAGE_DIRECTORY_READ"|"AI_BUDGET_READ"|"AI_WORKER_READ"|"BUSINESS_STAFF_ADMIN_READ"|"ACTION_APPROVAL_DIRECTORY_READ"|"BUSINESS_UNIT_DIRECTORY_READ"|"REGULATED_CASE_DIRECTORY_READ";
 resourceType:"ChessServiceCase"|"ChessOperationsPortfolio"|"ChessSecurityEvent"|"ChessClientDocument"|"ChessOperationsReport"|"ChessPayrollDispatch"|"ChessBankReview"|"ClientProfile"|"ChessAppointment"|"ChessWorkItem"|"ChessTaxWorkpaper"|"ChessBillingInvoice"|"ChessEmployeeAssignment"|"ChessWorkRecurrence"|"ChessEmployeeAlert"|"ChessServiceCase"|"ChessFinancialAttempt"|"ChessClientConsent"|"ChessWorkerRun"|"ChessAiSuggestion"|"ChessAiUsageDaily"|"ChessBusinessUnit"|"ChessActionApproval";resourceId:string;
};
/** Privacy-minimal record-access outcome. No names, properties, amounts,
 * document keys or raw service payloads are persisted in the audit. */
export function sensitiveReadEvent(ctx:SensitiveReadContext,allowed:boolean){
 return {
  ...(ctx.businessId?{businessId:ctx.businessId}:{}),
  actorClerkUserId:ctx.actorClerkUserId,
  action:ctx.action,
  resourceType:ctx.resourceType,
  resourceId:ctx.resourceId,
  decision:allowed?"ALLOW" as const:"DENY" as const,
 };
}
export async function auditedChessSensitiveRead<T>(
 db:PrismaClient,ctx:SensitiveReadContext,
 read:(tx:Prisma.TransactionClient)=>Promise<T|null>,
):Promise<T>{
 // Commit the access decision and the SELECT in the same tenant-local
 // SERIALIZABLE transaction; if the ledger write fails, no data is returned.
 const value=await db.$transaction(async tx=>{
  const payload=await read(tx);
  await tx.chessSecurityEvent.create({
   data:sensitiveReadEvent(ctx,payload!==null),
  });
  return payload;
 },{isolationLevel:"Serializable"});
 if(value===null)throw new PermissionError("record:read");
 return value;
}

/** Manager-scoped sensitive read with fresh authorization in the SAME
 * serializable transaction as the SELECT and immutable audit outcome.
 * Changing a role or business assignment before the read cannot expose
 * private appointment, queue, tax or invoice details. No PII is logged. */
export async function auditedChessManagerRead<T>(
 db:PrismaClient,ctx:SensitiveReadContext&{businessId:string},
 read:(tx:Prisma.TransactionClient)=>Promise<T|null>,
):Promise<T>{
 return auditedChessSensitiveRead(db,ctx,async tx=>{
  const [member,unit,assignment]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:ctx.actorClerkUserId},
    select:{status:true,role:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:ctx.businessId},
    select:{status:true}}),
   tx.chessEmployeeAssignment.findUnique({
    where:{businessId_clerkUserId:{businessId:ctx.businessId,
     clerkUserId:ctx.actorClerkUserId}},
    select:{role:true,revokedAt:true},
   }),
  ]);
  const allowed=member?.status==="ACTIVE"&&unit?.status==="ACTIVE"&&
   (["OWNER","ADMIN"].includes(member.role)||
    (member.role==="MEMBER"&&assignment?.role==="MANAGER"&&!assignment.revokedAt));
  return allowed?read(tx):null;
 });
}

/** Staff-only sensitive read. Neither a generic Clerk sign-in nor a
 * historical business assignment is authorization to see employee calendars
 * or private alerts. Authorization, SELECT and audit commit together. */
export async function auditedChessEmployeeRead<T>(
 db:PrismaClient,ctx:SensitiveReadContext&{businessId:string},
 read:(tx:Prisma.TransactionClient)=>Promise<T|null>,
):Promise<T>{
 return auditedChessSensitiveRead(db,ctx,async tx=>{
  const [member,unit,assignment]=await Promise.all([
   tx.membership.findUnique({where:{clerkUserId:ctx.actorClerkUserId},
    select:{status:true,role:true}}),
   tx.chessBusinessUnit.findUnique({where:{id:ctx.businessId},
    select:{status:true}}),
   tx.chessEmployeeAssignment.findUnique({where:{businessId_clerkUserId:{
    businessId:ctx.businessId,clerkUserId:ctx.actorClerkUserId,
   }},select:{revokedAt:true}}),
  ]);
  const allowed=member?.status==="ACTIVE"&&member.role!=="VIEWER"&&
   unit?.status==="ACTIVE"&&(
    ["OWNER","ADMIN"].includes(member.role)||
    !!assignment&&!assignment.revokedAt);
  return allowed?read(tx):null;
 });
}
