/**
 * Round 55: source-level regression gate for the machine trust boundaries and
 * the unpartitioned CRM lead security changes. These are explicit invariants
 * checked in CI, not proof of protected hosted multi-tenant acceptance.
 */
import { readFileSync } from "node:fs";
const read = p => readFileSync(p, "utf8");
const inv = JSON.parse(read("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json"));
const problems = [];
const crons = inv.routes.filter(x => x.status === "MACHINE_CALLBACK_NEEDS_REVIEW" &&
  x.path.startsWith("src/app/api/cron/")).map(x => x.path);
if (crons.length !== 17) problems.push("Expected exactly 17 historical machine cron routes");
function markers(path, tokens) {
  const source=read(path);
  for (const token of tokens) if (!source.includes(token))
    problems.push(path + " missing " + token);
  return source;
}
for (const path of crons) {
  const s=markers(path, [
    "requireKobiaCronAuth(req)",
    "activeWebhookTenantSchema(t.slug)",
    "schema !== t.schemaName",
    "getTenantPrisma(schema)",
  ]);
  if (s.includes("getTenantPrisma(t.schemaName)"))
    problems.push(path + " trusts the stale tenant registry schema");
  if (s.indexOf("activeWebhookTenantSchema(t.slug)") < s.indexOf("requireKobiaCronAuth(req)"))
    problems.push(path + " schema access before machine authorization");
}
const twilio=inv.routes.filter(x=>x.path.startsWith("src/app/api/webhooks/twilio/"));
if(twilio.length!==5)problems.push("Expected exactly five signed Twilio routes");
for(const {path} of twilio) {
  markers(path, [
    "validatedWebhookTenantSlug(", "validateSignature(",
    "twilioAccountMatches(", "activeWebhookTenantSchema(",
    "readBoundedTwilioParams(", "requireSingleLegacyMachineBusiness(db)",
  ]);
}
markers("src/app/api/webhooks/twilio/sms/route.ts", [
  "requireSingleLegacyMachineBusiness(tx)", "db.$transaction(async tx",
  "providerMessageSid: sid", "ourNumber.status",
]);
const inbound=markers("src/app/api/email/inbound/route.ts", [
  "inboundMailCredentialDecision(", "tenantRegistry.findUnique",
  "requireSingleLegacyMachineBusiness(db)", "requireSingleLegacyMachineBusiness(tx)",
  "Inbound attachments require reviewed scanning", "db.$transaction(async tx",
  "fromAddress: { equals: from, mode: ",
  "recordType: null", "recordId: null",
]);
if(inbound.includes("resolveLinkForAddress(") || inbound.includes("dispatchAutomation("))
  problems.push("Inbound relay still auto-links an unauthenticated sender to CRM");
const lead=markers("src/lib/chess/legacy-lead-security-round54.ts", [
  "withAuditedLegacyLeadRead(", "withAuditedLegacyLeadMutation(",
  "liveLegacyLeadActor(", "units.length > 1",
  "units[0].status", "chessSecurityEvent.create",
  'isolationLevel: "Serializable"',
]);
if(lead.includes('where: { status: "ACTIVE" }, select: { id: true }, take: 2'))
  problems.push("Legacy lead scope ignores inactive historical business unit");
const actions=markers("src/app/app/(crm)/leads/actions.ts", [
  "withAuditedLegacyLeadMutation(", "withAuditedLegacyLeadRead(",
  "changeLeadMetadata(tx", "LEGACY_LEAD_STAGE_CHANGED",
  "LEGACY_LEAD_CREATED", "LEGACY_LEAD_UPDATED", "LEGACY_LEAD_CONVERTED",
  "LEGACY_LEAD_DETAIL_READ",
]);
if(actions.includes("auditWrite({") || actions.includes("isOwn(before"))
  problems.push("Legacy lead still relies on preflight or best-effort audit");
markers("src/app/app/(crm)/leads/queries.ts", [
  "withAuditedLegacyLeadRead(", "legacyOwnerFilter(actor)",
  "tx.tagAssignment.findMany(",
]);
markers("src/app/app/(crm)/leads/kanban/queries.ts", [
  "withAuditedLegacyLeadRead(", "legacyOwnerFilter(actor)",
  "tx.tagAssignment.findMany(",
]);
markers("src/lib/security/legacy-machine-business-round55.ts", [
  "requireSingleLegacyMachineBusiness(", "legacyMachineBusinessAllowed(",
  "take: 2",
]);
console.log(JSON.stringify({
  checkedCronRoutes:crons.length,checkedTwilioRoutes:twilio.length,
  additionalInboundMail:true,
  protectedHistoricalLeadSurfaces:5,
  verifiedSourceBoundary:"live active tenant, canonical schema, single business, same-transaction access and audit",
  limitations:"Source-only, no protected multi-business staging, vendor acceptance, durable machine outbox, or full remaining CRM routes",
  issues:problems,
},null,2));
if(problems.length)throw Error("Round 55 machine and legacy lead security drift: "+problems.join("; "));
