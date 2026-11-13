/**
 * Guard all public POST form submission paths against a regression to
 * process-local maps, caller-supplied IP strings or missing bot checks.
 * Source gate complements executable unit + cross-client PostgreSQL tests.
 */
import { readFileSync } from "node:fs";
const read = path => readFileSync(path, "utf8");
const issues = [];
for (const path of [
  "src/app/api/forms/[slug]/submit/route.ts",
  "src/app/api/f2/[slug]/submit/route.ts",
]) {
  const source = read(path);
  for (const required of [
    "readPublicFormBody(req)", "admitPublicFormSubmission(req",
    "publicFormErrorResponse(error)",
  ]) if (!source.includes(required)) issues.push(path + ": missing " + required);
  if (/new Map<|x-forwarded-for|rateLimited\(/.test(source))
    issues.push(path + ": unsafe process-local or attacker-controlled IP quota");
}
for (const path of [
  "src/app/forms/[slug]/page.tsx", "src/app/f2/[slug]/page.tsx",
]) {
  const source = read(path);
  for (const marker of ["activePublicTenantSchema", "publicFormAction(",
    "NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY"])
    if (!source.includes(marker)) issues.push(path + " missing " + marker);
}
for (const path of [
  "src/app/forms/[slug]/PublicFormClient.tsx",
  "src/app/f2/[slug]/PublicFormUI.tsx",
]) {
  const source = read(path);
  if (!source.includes("<PublicFormChallenge") ||
      !source.includes("challengeToken") ||
      !source.includes("setResetNonce"))
    issues.push(path + ": missing client-side token and single-use reset");
}
const gate = read("src/lib/security/public-form-abuse.ts");
for (const marker of [
  'CHESS_PUBLIC_FORM_ABUSE_ENABLED !== "true"',
  'activePublicTenantSchema(input.tenant)',
  'claimPublicFormQuota(db,',
  'verifyPublicFormChallenge({',
  'tx.$queryRaw<',
  'PUBLIC_FORM_SUBMIT_V1',
  'CHESS_TURNSTILE_ALLOWED_HOSTNAMES',
  'CHESS_PUBLIC_FORM_RATE_HASH_KEY',
]) if (!gate.includes(marker)) issues.push("public form guard missing " + marker);
console.log(JSON.stringify({
  routes: 2, formPages: 2, sharedQuota: "PostgreSQL",
  botVerification: "Cloudflare Turnstile Siteverify (configured only)",
  issues,
}, null, 2));
if (issues.length) throw new Error("Round 52 public forms admission drift");
