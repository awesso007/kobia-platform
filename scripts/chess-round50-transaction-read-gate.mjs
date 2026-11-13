/**
 * Round 50: source inventory of every authenticated historical GET.
 * Only the tenant-schema routes using audited serialized transaction may be
 * claimed atomically audited. tRPC legacy-ledger query reads are separately
 * tracked until independently converted; public/machine methods are out of scope.
 */
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json","utf8"));
const read=path=>readFileSync(path,"utf8");
const issues=[],transactional=[],alreadyAudited=[],outside=[];
const get=s=>/export\s+(?:async\s+)?function\s+GET\s*\(|export\s+const\s+GET\b|export\s*\{[^}]*\bas\s+GET\b/.test(s);
const atomic=s=>/export\s+const\s+GET\s*=\s*withAuditedHistoricalGet\s*\(/.test(s);
const existing=s=>/export\s+const\s+GET\s*=\s*withAlreadyAuditedHistoricalGet\s*\(/.test(s);
for(const r of manifest.routes.filter(x=>x.status==="READ_PATH_REVIEW_REQUIRED")){
 const source=read(r.path);if(!get(source))continue;
 if(r.path==="src/app/api/trpc/[trpc]/route.ts"){outside.push(r.path);continue;}
 if(r.path==="src/app/api/client-profiles/route.ts"||
    r.path==="src/app/api/client-profiles/[profileId]/services/route.ts"){
  if(!existing(source))issues.push("Missing pre-audited route boundary "+r.path);
  else alreadyAudited.push(r.path);
  continue;
 }
 if(!atomic(source))issues.push("Missing atomic tenant read boundary "+r.path);
 else transactional.push(r.path);
 if(/import\s*\{\s*db\s*\}\s*from\s*["']@\/lib\/db["']/.test(source)||
    /getPlatformDb\s*\(/.test(source)||
    /getTenantPrisma\s*\(/.test(source))
  issues.push("Unreviewed independent database accessor "+r.path);
}
const wrapper=read("src/lib/chess/historical-get-response-audit.ts");
for(const marker of [
 'withHistoricalTenantReadScope(', 'db.$transaction(async tx=>',
 'tx.membership.findUnique(', 'tx.chessSecurityEvent.create(',
 'scope.accesses===0', 'isolationLevel:"Serializable"', 'if(!outcome)return deny(403)',
]){
 if(!wrapper.includes(marker))issues.push("Atomic wrapper lost "+marker);
}
for(const [path,markers] of Object.entries({
 "src/lib/db/get-tenant-db.ts":["scopedHistoricalTenantClient(tenantId, schemaName)"],
 "src/lib/db/tenant-prisma.ts":["scopedHistoricalTenantClient(null, schemaName)"],
 "src/app/api/search/route.ts":['withAuditedHistoricalReadResponse("search"'],
 "src/lib/client-profile/service.ts":["auditedChessSensitiveRead", "auditedClientServiceRead"],
 "src/lib/chess/historical-sensitive-read.ts":["isolationLevel:\u0022Serializable\u0022"],
})){
 const source=read(path);for(const marker of markers)if(!source.includes(marker))issues.push("Missing "+marker+" in "+path);
}
const trpcSource=read("src/server/trpc.ts");
for(const marker of [
 'db.$transaction(async tx=>',
 'withLegacyTrpcReadScope({',
 'tx.membership.findUnique({',
 'tx.auditLog.create({data:{',
 'HISTORICAL_TRPC_PROTECTED_QUERY_READ_ATOMIC',
]){
 if(!trpcSource.includes(marker))issues.push("Legacy tRPC atomic protected query middleware lost "+marker);
}
const bankHelper=read("src/lib/accounting/bank-rec.ts");
if(!bankHelper.includes('from "@/server/trpc-db"'))
 issues.push("Bank helper no longer uses scoped legacy query client");
for(const name of ["tenant","user","books","billing","ar","ap","bank"]){
 const s=read("src/server/routers/"+name+".ts");
 if(!s.includes('from "@/server/trpc-db"')||s.includes('from "@/lib/db"'))
  issues.push("Legacy tRPC router bypasses scoped query DB: "+name);
}
const scopedLegacy=read("src/server/trpc-db.ts");
for(const marker of ['currentLegacyTrpcReadScope()', 'Nested legacy Prisma transaction prohibited', 'Write operation prohibited in audited query']){
 if(!scopedLegacy.includes(marker))issues.push("Legacy query proxy lost fail-closed guard "+marker);
}
const eligible=transactional.length+alreadyAudited.length;
if(transactional.length!==39||alreadyAudited.length!==2||outside.length!==1)
 issues.push("Unexpected method inventory 39+2+1: "+transactional.length+"+"+alreadyAudited.length+"+"+outside.length);
console.log(JSON.stringify({
 inventoriedHistoricalRoutes:manifest.routes.length,
 authenticatedGetEndpoints:eligible+outside.length,
 transactionCoupledTenantGetRoutes:transactional.length,
 previouslyTransactionAuditedClientProfileRoutes:alreadyAudited.length,
 atomicLegacyTrpcProtectedQueryRoutes:outside,
 legacyTrpcMethod:"live membership, domain SELECT and immutable event in one legacy Prisma transaction",
 readOnlySearchPost:"transaction-coupled via same wrapper",
 certificationLimit:"Static gate only; protected signed-in multitenant PostgreSQL acceptance still required. Public and machine queries are separate." ,
 issues,
},null,2));
if(issues.length)throw Error("Round 50 historical SELECT atomic audit drift: "+issues.join("; "));
