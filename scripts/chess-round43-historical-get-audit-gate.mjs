/**
 * Round 43 method-level source gate for the 162-file historical API inventory.
 * This intentionally does NOT certify transaction-coupled SELECTs, public
 * token routes, machine callbacks, mutation responses, or tRPC internals.
 * Every authenticated historical GET marked READ_PATH_REVIEW_REQUIRED must
 * have a fail-closed response release wrapper. Routes are not marked safe
 * merely because a method name appears or a comment mentions "audit".
 */
import {readFileSync} from "node:fs";
const manifest=JSON.parse(readFileSync("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json","utf8"));
const s=r=>readFileSync(r.path,"utf8");
const get=source=>/export\s+(?:async\s+)?function\s+GET\s*\(|export\s+const\s+GET\b|export\s*\{[^}]*\bas\s+GET\b/.test(source);
const audit=source=>/export\s+const\s+GET\s*=\s*withAuditedHistoricalGet\s*\(/.test(source);
const awaiting=[],covered=[],nonGet=[],publicOrMachine=[];
for(const row of manifest.routes){
 const source=s(row);
 if(row.status==="READ_PATH_REVIEW_REQUIRED"){
  if(row.path==="src/app/api/trpc/[trpc]/route.ts"){
   const internal=readFileSync("src/server/trpc.ts","utf8");
   if(!source.includes('Explicit tenant required')||
      !internal.includes('HISTORICAL_TRPC_PROTECTED_QUERY_READ')||
      !internal.includes('.use(auditProtectedQuery)'))
    awaiting.push(row.path+" (tRPC selector/audit)");
   else covered.push(row.path+" (protected tRPC procedures only)");
  }else if(get(source)){
   if(!audit(source))awaiting.push(row.path);
   else covered.push(row.path);
  }else nonGet.push(row.path);
 }else if(["MACHINE_CALLBACK_NEEDS_REVIEW","PUBLIC_CAPABILITY_NEEDS_REVIEW"].includes(row.status)){
  publicOrMachine.push(row.path);
 }
}
const search=readFileSync("src/app/api/search/route.ts","utf8");
if(!search.includes('withAuditedHistoricalReadResponse("search"'))
 awaiting.push("src/app/api/search/route.ts (read-only POST)");
console.log(JSON.stringify({
 historicalRouteFiles:manifest.routes.length,
 authenticatedGetResponseGates:covered.length,
 nonGetRoutesStillNeedingMethodReview:nonGet.length,
 publicAndMachineRoutesRequiringSeparateReview:publicOrMachine.length,
 unguardedAuthenticatedGetRoutes:awaiting,
},null,2));
if(awaiting.length)throw new Error("Historical authenticated GET response audit source gap: "+awaiting.join(", "));
console.log("WARNING: response-after-read checks are not transaction-coupled SELECTs or all-method sensitive-read certification.");
