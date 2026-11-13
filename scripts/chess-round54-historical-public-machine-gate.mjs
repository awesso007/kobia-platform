/**
 * Round 54: guard all 9 inventoried public capability routes and 26 inventoried
 * machine callback routes, plus 4 historical routes actually accessible
 * without a Clerk session (signing, KB feedback, portal logout, inbound mail).
 * This is a source drift gate, not a runtime provider signature acceptance.
 */
import { readFileSync } from "node:fs";
const read = p => readFileSync(p, "utf8");
const inv = JSON.parse(read("docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json"));
const failures = [];
function requireTokens(path, tokens) {
  const s = read(path);
  for (const t of tokens)
    if (!s.includes(t)) failures.push(path + " missing " + t);
}
const publicPaths = inv.routes.filter(r => r.status === "PUBLIC_CAPABILITY_NEEDS_REVIEW").map(r => r.path);
const machinePaths = inv.routes.filter(r => r.status === "MACHINE_CALLBACK_NEEDS_REVIEW").map(r => r.path);
if (publicPaths.length !== 9 || machinePaths.length !== 26)
  failures.push("Historical public/machine inventory changed without review");
const checks = {
  "src/app/api/unsubscribe/route.ts": [
    "openUnsubscribeIdentity(", "activePublicTenantSchema(", "claimPublicSurfaceQuota(",
    "db.$transaction(async tx", "tx.broadcastRecipient.updateMany",
  ],
  "src/lib/marketing/broadcast.ts": [
    "makeUnsubscribeUrl(", "Unsubscribe from marketing emails",
    "unsubscribe.findUnique(", 'status: "PENDING"',
  ],
  "src/app/unsubscribe/page.tsx": ["openUnsubscribeIdentity(", "activePublicTenantSchema("],
  "src/app/unsubscribe/UnsubscribeClient.tsx": ["cap: capability", "readOnly", "disabled={submitting || !capability}"],
  "src/app/api/esign/[token]/complete/route.ts": [
    "activePublicTenantSchema(", "claimPublicSurfaceQuota(", "signByToken(", "readPublicFormBody(",
  ],
  "src/app/esign/[token]/page.tsx": ["activePublicTenantSchema(", "active &&", "markViewed("],
  "src/lib/documents/envelopes.ts": [
    "signByToken(", "db.$transaction(async tx", 'isolationLevel: "Serializable"',
    "tx.envelopeAuditEvent.create", "tx.envelopeSigner.updateMany",
  ],
  "src/app/api/kb/[id]/feedback/route.ts": [
    "activePublicTenantSchema(", "claimPublicSurfaceQuota(", "recordFeedback(", 'typeof obj.helpful !== "boolean"',
  ],
  "src/lib/helpdesk/kb.ts": [
    "recordFeedback(", "db.$transaction(async tx", 'article.visibility !== "PUBLIC"',
  ],
  "src/app/api/portal/logout/route.ts": ["activePublicTenantSchema(", "closePortalSession("],
  "src/app/api/email/inbound/route.ts": [
    "inboundMailCredentialDecision(", "inboundMailTenantSlug(", "tenantRegistry.findUnique",
    'tenant?.status !== "ACTIVE"', "readPublicFormBody(req, 65536)",
    "Inbound attachments require reviewed scanning", "db.$transaction(async tx",
    'isolationLevel: "Serializable"', "replayWhere",
  ],
  "src/lib/security/public-unsubscribe-round54.ts": [
    'createCipheriv("aes-256-gcm"', 'createDecipheriv("aes-256-gcm"',
    "CHESS_UNSUBSCRIBE_ENCRYPTION_KEYS", "randomBytes(12)", "validUnsubscribeIdentity(",
  ],
  "prisma/tenant/schema.prisma": [
    "@@unique([direction, providerMessageSid])",
    "@@unique([accountId, direction, externalId])",
  ],
};
for (const [path, tokens] of Object.entries(checks)) requireTokens(path, tokens);
for (const path of publicPaths) {
  const s = read(path);
  if (/getTenantPrisma\(schemaNameForSlug\(|new Map<|x-forwarded-for/.test(s))
    failures.push(path + " retains unsafe public tenant/IP shortcut");
}
for (const path of machinePaths) {
  if (path.includes("/cron/")) {
    requireTokens(path, ["requireKobiaCronAuth("]);
  } else if (path.includes("/webhooks/twilio/")) {
    requireTokens(path, [
      "validatedWebhookTenantSlug(", "validateSignature(", "activeWebhookTenantSchema(",
      "readBoundedTwilioParams(", "twilioAccountMatches(",
    ]);
    if (/req\.formData\(\)/.test(read(path))) failures.push(path + " parses unbounded vendor body");
  } else if (path.includes("/track/")) {
    requireTokens(path, ["verifyLegacyTrackingCapability(", "activeWebhookTenantSchema("]);
  } else if (path.includes("/stripe")) {
    requireTokens(path, ["status: 503"]);
  }
}
requireTokens("src/app/api/webhooks/twilio/sms/route.ts", [
  'ourNumber.status !== "ACTIVE"', 'ourNumber.provider !== "TWILIO"',
  "providerMessageSid: sid", "db.$transaction(async tx",
]);
requireTokens("src/app/api/webhooks/twilio/voice/incoming/route.ts", [
  'ourNumber.status !== "ACTIVE"', 'ourNumber.provider !== "TWILIO"',
]);
requireTokens("src/app/api/webhooks/twilio/voice/status/route.ts", [
  "db.call.updateMany(", "endedAt: null", "updated.count !== 1",
]);
requireTokens("src/app/api/webhooks/twilio/sms/status/route.ts", [
  'direction: "OUTBOUND"', "db.smsMessage.updateMany(",
]);
requireTokens("src/lib/security/legacy-webhook-tenant.ts", [
  "readBoundedTwilioParams(", "twilioAccountMatches(",
]);
for (const path of [
  "src/app/api/portal/login/route.ts",
  "src/app/api/portal/tickets/route.ts",
  "src/app/api/portal/tickets/[id]/reply/route.ts",
]) {
  if (!/status:\s*503/.test(read(path)))
    failures.push(path + " must keep verified-helpdesk login disabled");
}
console.log(JSON.stringify({
  historicallyInventoriedPublic: publicPaths.length,
  historicallyInventoriedMachine: machinePaths.length,
  additionalAnonymousPaths: 4,
  nonceBoundUnsubscribe: true, vendorReplayConstraint: true,
  failures,
}, null, 2));
if (failures.length) throw Error("Round 54 public/machine inventory gate: " + failures.join("; "));
