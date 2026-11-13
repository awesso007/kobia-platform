import {createHash} from "node:crypto";

export const regulatedWorkflowKinds={
 MORTGAGE:["MORTGAGE_APPLICATION_COORDINATION","MORTGAGE_DOCUMENT_INTAKE"],
 INSURANCE:["INSURANCE_COVERAGE_INTAKE","INSURANCE_APPLICATION_COORDINATION"],
 REAL_ESTATE:["REAL_ESTATE_BUYER_INTAKE","REAL_ESTATE_SELLER_INTAKE"],
 INVESTMENTS:["INVESTMENTS_GOAL_DISCOVERY","INVESTMENTS_RISK_DISCOVERY"],
} as const;
export type RegulatedService=keyof typeof regulatedWorkflowKinds;
export type RegulatedWorkflowKind=(typeof regulatedWorkflowKinds)[RegulatedService][number];

const base=["CLIENT_SCOPE_DISCLOSED","DOCUMENT_HANDLING_REVIEWED",
 "LICENSE_CHECK_RECORDED","FIRM_AFFILIATION_REVIEWED"] as const;
const specific:Record<RegulatedService,readonly string[]>={
 MORTGAGE:["BROKER_RELATIONSHIP_DISCLOSED","APPLICATION_HANDOFF_REVIEWED"],
 INSURANCE:["PRODUCER_RELATIONSHIP_DISCLOSED","COVERAGE_REQUEST_REVIEWED"],
 REAL_ESTATE:["BROKERAGE_RELATIONSHIP_DISCLOSED","AGENCY_REPRESENTATION_REVIEWED"],
 INVESTMENTS:["INVESTMENT_CAPACITY_DISCLOSED","SUPERVISORY_HANDOFF_REVIEWED"],
};
export function workflowService(kind:string):RegulatedService|null{
 for(const [service,kinds] of Object.entries(regulatedWorkflowKinds)){
  if((kinds as readonly string[]).includes(kind))return service as RegulatedService;
 }
 return null;
}
export function requiredRegulatedChecklist(kind:string):string[]{
 const service=workflowService(kind);
 if(!service)throw new Error("Unsupported regulated-service workflow kind.");
 return [...base,...specific[service]];
}
/** A unique opaque reference is safe for retry and does not encode client PII. */
export function regulatedIdempotencyKey(tenantSlug:string,businessId:string,
 serviceCaseId:string,requestKey:string):string{
 return createHash("sha256").update(JSON.stringify({
  purpose:"REGULATED_WORKFLOW_HANDOFF_V1",tenantSlug,businessId,serviceCaseId,requestKey,
 })).digest("hex");
}
export type WorkflowReviewState={
 status:string;createdByClerkUserId:string;reviewedByClerkUserId:string|null;
};
export function canReviewRegulatedWorkflow(record:WorkflowReviewState,
 reviewer:string,role:string,decision:"REVIEW"|"APPROVED"):boolean{
 if(!["OWNER","ADMIN"].includes(role)||record.createdByClerkUserId===reviewer)return false;
 if(decision==="REVIEW")return record.status==="DRAFT";
 return record.status==="REVIEW"&&!!record.reviewedByClerkUserId&&
  record.reviewedByClerkUserId!==reviewer;
}
export function validAffiliation(
 record:{status:string;checkedAt:Date|null;expiresAt:Date|null;
  verifiedByClerkUserId:string|null;sourceUrl:string|null}|null,
 now=new Date(),
):boolean{
 return !!record && record.status==="VERIFIED"&&!!record.verifiedByClerkUserId&&
  !!record.sourceUrl&&!!record.checkedAt&&
  record.checkedAt<=now&&now.getTime()-record.checkedAt.getTime()<24*60*60_000&&
  (!record.expiresAt||record.expiresAt>now);
}
