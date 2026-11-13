/**
 * Round 57 security source gate and HONEST historical write inventory.
 *
 * A green static gate verifies the reviewed subset only. It reports remaining
 * unaudited writes rather than pretending that an after-the-fact event makes
 * every legacy or public provider mutation transactionally safe.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const read=p=>readFileSync(p,"utf8");
function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(ent=>{
  const path=join(dir,ent.name);
  return ent.isDirectory()?walk(path):[path.replaceAll("\\","/")];
 });
}
const err=[];
function must(path,tokens){
 const s=read(path);
 for(const t of tokens)if(!s.includes(t))err.push(path+" missing "+t);
 return s;
}
const expected=[
 "forms2/[id]/fields/[fieldId]",
 "forms2/[id]/fields/reorder",
 "forms2/[id]/fields",
 "forms2/[id]/steps/[stepId]",
 "forms2/[id]/steps/reorder",
 "forms2/[id]/steps",
 "forms2/[id]/publish",
 "forms2/[id]",
 "forms2",
 "sites/[siteId]/pages/[pageId]/blocks",
 "sites/[siteId]/pages",
 "sites/[siteId]/domains",
 "sites",
 "sites/themes",
 "sites/[siteId]",
 "workflows",
 "workflows/[id]",
 "workflows/[id]/publish",
 "workflows/[id]/runs/[runId]/cancel",
 "helpdesk/kb",
 "helpdesk/kb/[id]",
 "helpdesk/categories",
 "helpdesk/categories/[id]",
 "helpdesk/kb-categories",
 "helpdesk/kb-categories/[id]",
 "helpdesk/sla",
 "helpdesk/sla/[id]",
 "helpdesk/teams",
 "helpdesk/teams/[id]",
 "inventory/vendors",
 "inventory/vendors/[id]",
 "inventory/warehouses",
 "inventory/warehouses/[id]",
];
const expectedSet=new Set(expected);
if(expected.length!==33||expectedSet.size!==33)err.push("reviewed list must contain exactly 27 distinct route files");
const all=walk("src/app/api").filter(p=>p.endsWith("/route.ts"));
const writeOf=s=>{
 const methods=[...s.matchAll(/export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/g)]
  .map(x=>x[1]);
 if(/export\s*\{\s*handler\s+as\s+GET,\s*handler\s+as\s+POST\s*\}/.test(s))
  methods.push("POST");
 return [...new Set(methods)];
};
const counted=[];
const notWrapped=[];
let verifiedMethods=0;
for(const path of all){
 const src=read(path),methods=writeOf(src),id=path.slice("src/app/api/".length,-"/route.ts".length);
 if(!methods.length)continue;
 const audited=expectedSet.has(id);
 if(audited){
  must(path,['withAuditedHistoricalMutation','await requirePermission(','getTenantDb()']);
  for(const method of methods){
   const marker='export const '+method+' = withAuditedHistoricalMutation("'+id+'", "'+method+'", '+method+'Original);';
   if(!src.includes(marker)||!src.includes('async function '+method+'Original('))
    err.push("Missing live audited method "+method+" in "+path);
   else verifiedMethods++;
  }
  if(src.includes(".$transaction("))err.push("Nested transaction in audited REST "+path);
 }else notWrapped.push({id,methods:methods.length});
 counted.push({id,methods:methods.length,audited});
}
for(const id of expected)
 if(!counted.some(x=>x.id===id&&x.audited))
  err.push("Reviewed audited route disappeared: "+id);
if(verifiedMethods!==44)
 err.push("Expected 44 transaction-coupled REST methods, found "+verifiedMethods);
const trpc=must("src/server/trpc.ts",[
 "auditProtectedMutation", "withLegacyTrpcMutationScope(",
 'action:"HISTORICAL_TRPC_PROTECTED_MUTATION_ATOMIC"',
 "scope.mutations===0", 'isolationLevel:"Serializable"',
]);
must("src/server/trpc-db.ts",[
 "currentLegacyTrpcReadScope()", "MUTATIONS.has(method)",
 "scope.mutations++",
 "Nested legacy Prisma transaction prohibited",
 "Write operation prohibited in audited query",
]);
must("src/server/trpc-read-scope.ts",[
 "withLegacyTrpcMutationScope<T>(", "mode:", "mutations:0",
]);
if(!trpc.includes(".use(auditProtectedQuery).use(auditProtectedMutation)"))
 err.push("Protected tRPC query and mutation audit middleware absent");
must("src/lib/db/historical-read-scope.ts",[
 "withHistoricalTenantWriteScope<T>(", "scope.closed=true",
 "scope.schemaName !== schemaName",
]);
must("src/lib/chess/historical-mutation-response-audit-round57.ts",[
 "withAuditedHistoricalMutation", "db.$transaction(async tx",
 "tx.membership.findUnique", "tx.chessSecurityEvent.create",
 "result.status>=400", "accesses===0",
 'isolationLevel:"Serializable"',
]);
for(const path of [
 "src/app/app/(crm)/contacts/actions.ts",
 "src/app/app/(crm)/companies/actions.ts",
 "src/app/app/(crm)/deals/actions.ts",
 "src/app/app/(crm)/activities/actions.ts",
 "src/app/app/(crm)/bulk/actions.ts",
 "src/app/app/(crm)/deals/line-items/actions.ts",
 "src/app/app/(crm)/settings/tags/actions.ts",
 "src/app/app/(crm)/settings/custom-fields/actions.ts",
]){
 must(path,["withLegacyCrmTransaction("]);
}
must("src/app/app/(crm)/leads/actions.ts",[
 "withAuditedLegacyLeadMutation(", "withAuditedLegacyLeadRead(",
]);
must("src/lib/chess/security-events.ts",[
 'action:z.literal("OPERATOR_SECURITY_REVIEW_REQUESTED")',
 'decision:z.literal("REVIEW")',
 "db.$transaction(async tx",
]);
const serverActions=walk("src/app").filter(p=>p.endsWith("/actions.ts"));
const inv=JSON.parse(read("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json"));
const legacy=inv.routes.filter(r=>r.status==="READ_PATH_REVIEW_REQUIRED").map(r=>r.path);
const legacyPending=notWrapped.filter(r=>legacy.includes("src/app/api/"+r.id+"/route.ts"));
console.log(JSON.stringify({
 historicalInventoriedRoutes:inv.routes.length,
 allFilesystemApiRouteFiles:all.length,
 apiRouteFilesWithWrites:counted.length,
 reviewedAtomicRestRouteFiles:expected.length,
 reviewedAtomicRestMethods:verifiedMethods,
 authenticatedLegacyRestStillNeedingCaseByCaseMutationAudit:legacyPending.length,
 otherApiWriteFilesNotCertifiedByThisGate:notWrapped.length-legacyPending.length,
 serverActionFilesFound:serverActions.length,
 protectedTrpcMutations:"one legacy database transaction, live principal, actual Prisma mutation, AuditLog",
 publicMachineAuthorizations:"Round 54/55 separate source gates; not certified by this atomic REST subset",
 openCoverage:"Other REST, actions, helpers, public/machine callbacks, external outcomes and hosted acceptance require future detailed tests",
 pendingSamples:notWrapped.slice(0,16).map(x=>x.id),
 issues:err,
},null,2));
if(err.length)throw Error("Round 57 historical write coverage drift: "+err.join("; "));
