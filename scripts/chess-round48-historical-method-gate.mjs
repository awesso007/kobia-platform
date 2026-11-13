/**
 * Round 48 legacy API method/security coverage inventory and drift gate.
 *
 * All 162 historical route files must retain their declared classification.
 * This gate covers *entrypoint controls* for explicitly reviewed public and
 * machine endpoints. It deliberately does NOT certify mutation atomicity,
 * direct SELECT audit, signature acceptance, scoped data sharing or any
 * unreviewed authenticated POST/PATCH/DELETE route.
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

const inv=JSON.parse(readFileSync("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json","utf8"));
const read=path=>readFileSync(path,"utf8");
const problems=[];
const counts={};
const methods={};
const exportsIn=source=>{
 const result=new Set([...source.matchAll(/export\s+(?:async\s+function\s+|function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|OPTIONS)\s*(?:\(|=)/g)].map(x=>x[1]));
 // Next.js tRPC adapters may re-export a common handler by HTTP method.
 for(const group of source.matchAll(/export\s*\{([^}]+)\}/g))
  for(const alias of group[1].matchAll(/\bas\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/g))result.add(alias[1]);
 return result;
}
const requireTokens=(path,tokens)=>{
 const src=read(path);
 for(const token of tokens)if(!src.includes(token))problems.push(`${path} missing security boundary ${token}`);
};
const checkMethods=(path,expected)=>{
 const found=methods[path]??[];
 if(found.join(",")!==expected.slice().sort().join(","))problems.push(`Unexpected methods: ${path} has [${found}]; expected [${expected}]`);
};
for(const item of inv.routes){
 if(!existsSync(item.path)){problems.push(`Missing classified file: ${item.path}`);continue}
 counts[item.status]=(counts[item.status]??0)+1;
 methods[item.path]=[...exportsIn(read(item.path))].sort();
 if(methods[item.path].length===0)problems.push(`Unclassified export method shape: ${item.path}`);
}
if(inv.routes.length!==162)problems.push("Historical API inventory count changed without review");
for(const [key,expected] of Object.entries({
 READ_PATH_REVIEW_REQUIRED:111,
 PUBLIC_CAPABILITY_NEEDS_REVIEW:9,
 MACHINE_CALLBACK_NEEDS_REVIEW:26,
 SOURCE_GUARDED_SUBSET:13,
 UNVERIFIED_SESSION_DISABLED:3,
}))if(counts[key]!==expected)problems.push(`Changed historical classification: ${key}=${counts[key]}`);
const publicMethods={
 "src/app/api/book/[slug]/cancel/route.ts":["OPTIONS","POST"],
 "src/app/api/book/[slug]/slots/route.ts":["GET"],
 "src/app/api/book/[slug]/submit/route.ts":["OPTIONS","POST"],
 "src/app/api/f2/[slug]/payment-intent/route.ts":["OPTIONS","POST"],
 "src/app/api/f2/[slug]/submit/route.ts":["OPTIONS","POST"],
 "src/app/api/f2/[slug]/track/route.ts":["OPTIONS","POST"],
 "src/app/api/forms/[slug]/submit/route.ts":["OPTIONS","POST"],
 "src/app/api/sites/track/route.ts":["OPTIONS","POST"],
 "src/app/api/unsubscribe/route.ts":["POST"],
};
for(const [path,expected] of Object.entries(publicMethods))checkMethods(path,expected);
requireTokens("src/app/api/f2/[slug]/payment-intent/route.ts",["status: 503","paid: false"]);
const payment=read("src/app/api/f2/[slug]/payment-intent/route.ts");
if(/markSubmissionPaid|stub_|paymentIntent\.create|db\./.test(payment))problems.push("Public payment initiation must be non-mutating until verified receipt design");
requireTokens("src/app/api/book/[slug]/cancel/route.ts",["cancelPublicBookingAtomic", "admitPublicSurface"]);
requireTokens("src/lib/calendar/public-booking-cancel-round53.ts",[
  "secureBookingManageTokenMatches", "tx.booking.updateMany",
  "tx.calendarEvent.updateMany", "db.$transaction(async tx",
  'isolationLevel: "Serializable"',
]);
requireTokens("src/app/api/email/inbound/route.ts",["inboundMailCredentialDecision","inboundMailTenantSlug","tenantRegistry.findUnique","emailAccount.findFirst"]);
if(/DEFAULT_TENANT|fallback to the default tenant/i.test(read("src/app/api/email/inbound/route.ts")))problems.push("Legacy inbound mail tenant fallback detected");
for(const kind of ["sms/route.ts","sms/status/route.ts","voice/incoming/route.ts","voice/recording/route.ts","voice/status/route.ts"]){
 const path=`src/app/api/webhooks/twilio/${kind}`;
 checkMethods(path,["POST"]);
 requireTokens(path,["validatedWebhookTenantSlug","validateSignature","activeWebhookTenantSchema"]);
 if(read(path).includes("DEFAULT_TENANT"))problems.push(`Unsafe Twilio default tenant in ${path}`);
}
requireTokens("src/lib/telephony/twilio.ts",["twilioTenantCallbackUrl","recordingStatusCallback"]);
for(const path of ["src/app/api/track/click/[recipientId]/route.ts","src/app/api/track/open/[recipientId]/route.ts"]){
 checkMethods(path,["GET"]);requireTokens(path,["verifyLegacyTrackingCapability","activeWebhookTenantSchema"]);
}
requireTokens("src/lib/marketing/broadcast.ts",["issueLegacyTrackingCapability"]);
for(const path of ["src/app/api/webhooks/stripe-billing/route.ts","src/app/api/webhooks/stripe/route.ts"]){
 checkMethods(path,["POST"]);
 const src=read(path);
 if(!src.includes("status: 503")||/getPlatformDb|\.webhooks\.constructEvent|provisionTenantFromPending|tenantRegistry\.update/.test(src))problems.push(`Unsafe legacy Stripe mutation path: ${path}`);
}
for(const item of inv.routes.filter(x=>x.status==="MACHINE_CALLBACK_NEEDS_REVIEW" && x.path.includes("/cron/"))){
 checkMethods(item.path,["GET"]);requireTokens(item.path,["requireKobiaCronAuth"]);
}
const remainingMutationPaths=inv.routes.filter(item=>item.status==="READ_PATH_REVIEW_REQUIRED" && (methods[item.path]??[]).some(m=>m!=="GET"&&m!=="OPTIONS"));
const remainingPublicCapabilities=inv.routes.filter(item=>item.status==="PUBLIC_CAPABILITY_NEEDS_REVIEW");
const remainingMachineCallbacks=inv.routes.filter(item=>item.status==="MACHINE_CALLBACK_NEEDS_REVIEW");
console.log(JSON.stringify({
  inventoriedHistoricalRouteFiles:inv.routes.length,
  perClassification:counts,
  historicalAuthenticatedRouteFilesWithNonGetMethods:remainingMutationPaths.length,
  declaredPublicCapabilityFiles:remainingPublicCapabilities.length,
  declaredMachineCallbackFiles:remainingMachineCallbacks.length,
  reviewedBoundaries:"Round 48 payment, inbound relay, 5 signed Twilio callbacks, 2 tracking capabilities, booking cancellation, 2 disabled Stripe callbacks",
  uncuredScope:"Method inventory does not prove remaining mutation authorization, privacy or atomic SELECT audit",
  issues:problems,
},null,2));
if(problems.length)throw new Error("Round 48 historical API entrypoint security drift: "+problems.join("; "));
