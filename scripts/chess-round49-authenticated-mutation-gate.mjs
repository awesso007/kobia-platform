/**
 * Round 49: inventory ALL authenticated historical non-GET methods and
 * reject missing live permission / tenant boundary admission. Source gate,
 * not equivalent to transactional resource-level authorization or pen test.
 */
import {readFileSync} from "node:fs";
const inv=JSON.parse(readFileSync("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json","utf8"));
const read=p=>readFileSync(p,"utf8");
const issues=[], counts={}, reviewed=[];
const exceptional={
"src/app/api/active-module/route.ts":"ACTIVE_MODULE_MEMBERSHIP",
"src/app/api/calls/dial/route.ts":"DELEGATED_CALL",
"src/app/api/feed/follows/route.ts":"DELEGATED_FEED_FOLLOW",
"src/app/api/client-profiles/route.ts":"CHESS_SERVICE",
"src/app/api/client-profiles/[profileId]/services/route.ts":"CHESS_SERVICE",
"src/app/api/client-service-links/[linkId]/grants/route.ts":"CHESS_SERVICE",
"src/app/api/email/inbound/route.ts":"SIGNED_RELAY",
"src/app/api/esign/[token]/complete/route.ts":"PUBLIC_SIGNER",
"src/app/api/kb/[id]/feedback/route.ts":"PUBLIC_FEEDBACK",
"src/app/api/portal/logout/route.ts":"PUBLIC_LOGOUT",
"src/app/api/search/route.ts":"READ_ONLY_POST",
"src/app/api/trpc/[trpc]/route.ts":"TRPC_PROCEDURES",
};
function methods(src){
 const result={};const matches=[...src.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g)];
 for(let i=0;i<matches.length;i++)result[matches[i][1]]=src.slice(matches[i].index,matches[i+1]?.index??src.length);
 if(/export\s*\{\s*handler\s+as\s+GET,\s*handler\s+as\s+POST\s*\}/.test(src))result.POST="tRPC alias";
 return result;
}
const evidence=(path,token)=>{if(!read(path).includes(token))issues.push("Missing "+token+" in "+path);};
for(const r of inv.routes.filter(r=>r.status==="READ_PATH_REVIEW_REQUIRED")){
 const source=read(r.path), declared=methods(source);
 const verbs=Object.keys(declared).filter(x=>x!=="GET");
 if(!verbs.length)continue;
 const kind=exceptional[r.path]??(r.path.startsWith("src/app/api/mail/")?"OWNED_MAIL":"DIRECT_RBAC");
 counts[kind]=(counts[kind]??0)+1;
 for(const verb of verbs){
  const body=declared[verb];
  if(kind==="DIRECT_RBAC"){
   const auth=body.indexOf("await requirePermission("), scoped=body.indexOf("getTenantDb()");
   if(auth<0||scoped<0||auth>scoped)issues.push(r.path+" "+verb+" must authorize before tenant DB");
  }else if(kind==="OWNED_MAIL"){
   if(!body.includes("await resolveMail(params.accountId,"))issues.push(r.path+" "+verb+" missing owned-mail resolver");
  }else if(kind==="DELEGATED_FEED_FOLLOW"){
   if(!body.includes('await requirePermission("record:create")') ||
      !body.includes("await handle("))
    issues.push(r.path+" "+verb+" missing explicit permission before delegated handle");
  }
 }
 reviewed.push({path:r.path,kind,methods:verbs});
}
const check={
"src/app/api/active-module/route.ts":["moduleTenantAuthorized","assertMutationOrigin(req)","auth().userId"],
"src/app/api/calls/dial/route.ts":["startCall(input)"],
"src/app/app/(crm)/call-actions.ts":['await requirePermission("telephony:manage")'],
"src/app/api/feed/follows/route.ts":['async function handle(', 'await requirePermission("record:create")', 'const { db } = getTenantDb()'],
"src/lib/mail/api.ts":["getOwnedAccount(db, accountId, userId)","await requirePermission(action)"],
"src/app/api/files/local-upload/[...key]/route.ts":["localUploadIsAuthorized",'await requirePermission("record:create")'],
"src/app/api/email/inbound/route.ts":["inboundMailCredentialDecision"],
"src/app/api/esign/[token]/complete/route.ts":["signByToken"],
"src/app/api/search/route.ts":["withAuditedHistoricalReadResponse"],
"src/app/api/trpc/[trpc]/route.ts":["Explicit tenant required"],
};
for(const [path,need] of Object.entries(check))for(const token of need)evidence(path,token);
for(const path of [
"src/app/api/client-profiles/route.ts",
"src/app/api/client-profiles/[profileId]/services/route.ts",
"src/app/api/client-service-links/[linkId]/grants/route.ts"
])evidence(path,"assertMutationOrigin");
for(const path of [
"src/app/api/forms2/[id]/fields/[fieldId]/route.ts",
"src/app/api/forms2/[id]/steps/[stepId]/route.ts",
"src/app/api/forms2/[id]/fields/route.ts",
"src/app/api/forms2/[id]/steps/route.ts",
"src/app/api/forms2/[id]/fields/reorder/route.ts",
"src/app/api/forms2/[id]/steps/reorder/route.ts",
"src/app/api/sites/[siteId]/pages/[pageId]/route.ts",
"src/app/api/sites/[siteId]/pages/[pageId]/blocks/route.ts",
"src/app/api/sites/[siteId]/domains/route.ts",
"src/app/api/workflows/[id]/runs/[runId]/cancel/route.ts",
])evidence(path,"historical-resource-scope");
for(const path of [
"src/app/api/chat/channels/[id]/messages/route.ts",
"src/app/api/chat/channels/[id]/read/route.ts",
"src/app/api/chat/messages/[id]/react/route.ts",
"src/app/api/chat/messages/[id]/pin/route.ts",
"src/app/api/chat/messages/[id]/route.ts",
])evidence(path,"authorizedChatChannel");
evidence("src/app/api/chat/dm/route.ts",'status: "ACTIVE"');
if(reviewed.length<100)issues.push("Fewer than 100 historical classified mutation paths: inspect removals");
console.log(JSON.stringify({
 historicallyClassifiedFiles:111,
 pathsWithMutation:reviewed.length,
 methods:reviewed.reduce((sum,x)=>sum+x.methods.length,0),
 byAdmissionClass:counts,issues,
 limitation:"Source admission only: origin checks, same-transaction resource grants and protected E2E remain open."
},null,2));
if(issues.length)throw new Error("Round 49 historical method security gate: "+issues.join("; "));
