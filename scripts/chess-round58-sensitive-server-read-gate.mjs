/**
 * Round 58 source gate for server-rendered CRM sensitive reads. Server pages
 * are NOT Next REST GET routes: Round 50's historical API GET inventory could
 * not protect these query helpers. This gate closes the enumerated page-query
 * bypass while separately tracking excluded and unreviewed read surfaces.
 */
import { readFileSync,readdirSync } from "node:fs";
const read=p=>readFileSync(p,"utf8");
const modules=[
 "activities","quotes","marketing","settings/audit",
 "automations","chat","documents","feed","helpdesk",
 "mail","sites","workgroups","reports",
];
const expected={
 "activities":3,"quotes":2,"marketing":10,"settings/audit":1,
 "automations":3,"chat":3,"documents":6,"feed":4,
 "helpdesk":9,"mail":5,"sites":7,"workgroups":8,"reports":10,
};
const issues=[];
const helper=read("src/lib/chess/historical-server-read-round58.ts");
for(const marker of [
 "liveLegacyLeadActor(tx,identity.clerkUserId",
 "if(actor.role!==\"OWNER\"&&actor.role!==\"ADMIN\")",
 "tx.clientProfile.count({",
 "serviceLinks:{none:{}}",
 "tx.clientServiceLink.count({",
 "grants:{none:{",
 "revokedAt:null,canRead:true",
 "withHistoricalTenantReadScope({",
 "scope.accesses===0",
 "tx.chessSecurityEvent.create({data:{",
 "db.$transaction(async tx=>",
 "isolationLevel:\"Serializable\"",
]){
 if(!helper.includes(marker))issues.push("Read boundary missing "+marker);
}
let total=0;
for(const moduleName of modules){
 const path="src/app/app/(crm)/"+moduleName+"/queries.ts",src=read(path);
 const prior=[...src.matchAll(/async function (\w+)Original\s*\(/g)].map(m=>m[1]);
 let verified=0;
 for(const name of prior){
  // The report runner accepts an already-audited transaction client and
  // therefore uses the explicit conditional wrapper checked below.
  if(moduleName==="reports"&&name==="runReport")continue;
  const token='export const '+name+' = withAuditedHistoricalServerRead("'+moduleName+'.'+name+'", '+name+'Original);';
  if(!src.includes(token))issues.push(path+" missing wrapper "+name);
  else verified++;
 }
 const unwrapped=[...src.matchAll(/export async function (\w+)\s*\(/g)].map(m=>m[1]);
 const allowed=moduleName==="chat"?["currentUserId"]:moduleName==="reports"?["runReport"]:[];
 for(const fn of unwrapped){
  if(!allowed.includes(fn))issues.push(path+" new sensitive read bypass: "+fn);
 }
 for(const fn of allowed){
  if(!unwrapped.includes(fn))issues.push(path+" lost expected scoped exception "+fn);
 }
 if(moduleName==="reports"){
  if(!src.includes('withAuditedHistoricalServerRead("reports.runReport", runReportOriginal)(def)')||
     !src.includes('if (scopedDb) return runReportOriginal(def, scopedDb)'))
    issues.push("Raw report runner can escape audited server-render boundary");
  else verified++;
 }
 if(verified!==expected[moduleName])
  issues.push(path+" expected "+expected[moduleName]+" audited entrypoints but has "+verified);
 total+=verified;
}
if(total!==71||modules.length!==13)issues.push("Expected exactly 71 protected CRM query entrypoints across 13 modules");
const projectSource=read("src/lib/projects/queries.ts");
for(const fn of ["getMembersLite","listProjects","getProjectDetail","getMyTasks","getTaskDetail"]){
 const evidence='export const '+fn+' = withAuditedHistoricalServerRead("projects.'+fn+'", '+fn+'Original);';
 if(!projectSource.includes(evidence))issues.push("Project sensitive read bypass: "+fn);
}
if(!projectSource.includes("getMembersLiteOriginal()"))
 issues.push("Project internal membership SELECT no longer bound to audited parent");
const telephonySource=read("src/app/app/(crm)/settings/telephony/actions.ts");
for(const fn of ["listPhoneNumbers","listMembers","listRules"]){
 if(!telephonySource.includes('withAuditedHistoricalServerRead("telephony.'+fn+'", async () => {'))
  issues.push("Telephony sensitive action read bypass: "+fn);
}

const action=read("src/app/app/(crm)/reports/actions.ts");
if(!action.includes('withLegacyCrmTransaction(db,actor,"report:run"')||
   !action.includes("if(await tx.clientProfile.count())"))
 issues.push("Exception report-scoped transaction no longer checks client isolation");
const excluded=[
 "src/app/app/(crm)/contacts/queries.ts",
 "src/app/app/(crm)/companies/queries.ts",
 "src/app/app/(crm)/deals/queries.ts",
 "src/app/app/(crm)/leads/queries.ts",
 "src/app/app/(crm)/leads/kanban/queries.ts",
];
for(const path of excluded){
 const src=read(path);
 if(!src.includes("withAuditedLegacyLeadRead(")&&
    !src.includes("withLegacyCrmTransaction("))
  issues.push(path+" lost prior per-record audited query authorization");
}
console.log(JSON.stringify({
 queryModules:modules.length, auditedServerReadEntrypoints:total+8,
 atomicTransaction:"live active principal, ONE historical business, all client service grants, SELECT, audit event",
 acceptedNarrowExceptions:["chat.currentUserId (identity only)","reports.runReport(scopedDb) (audited parent required)"],
 additionalProtectedReadSurfaces:["5 project/task loaders","3 telephony server action reads"],
 otherPriorPerRecordCRMModules:excluded.length,
 remaining:"Other unreviewed loaders, server actions, dynamic helpers and third-party sources need individual review; protected cross-business staged acceptance still open",
 issues,
},null,2));
if(issues.length)throw Error("Round 58 sensitive-server-read source gate failed: "+issues.join("; "));
