import {getTenantDb} from "@/lib/db/get-tenant-db";

const slug=/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
export function isAuthorizedWorkflowTenant(tenantId:string,config:{
 schedulerEnabled?:string;allowedTenants?:string;calendarEnabled?:string;
},requiresCalendar=false):boolean{
 if(config.schedulerEnabled!=="true" || !slug.test(tenantId))return false;
 if(requiresCalendar && config.calendarEnabled!=="true")return false;
 const allow=(config.allowedTenants??"").split(",").map(s=>s.trim()).filter(Boolean);
 return allow.length>0 && allow.length<=50 && allow.every(s=>slug.test(s)) &&
   allow.includes(tenantId);
}
/** Every machine endpoint must validate its tenant against the allowlist;
 * possessing a scheduler token alone grants NO right to target other tenants. */
export function assertAuthorizedWorkflowTenant(requiresCalendar=false):void {
 const {tenantId}=getTenantDb();
 if(!isAuthorizedWorkflowTenant(tenantId,{
  schedulerEnabled:process.env.CHESS_SCHEDULER_ENABLED,
  allowedTenants:process.env.CHESS_ACTIVE_TENANT_SLUGS,
  calendarEnabled:process.env.CHESS_CALENDAR_SYNC_ENABLED,
 },requiresCalendar))throw new Error("Workflow worker tenant is disabled or not approved.");
}
