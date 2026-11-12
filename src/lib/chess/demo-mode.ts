/**
 * Codespaces-only CHESS demonstration policy.
 * Never use this switch to approve external services, manufacture consent,
 * override licensing, or enable regulated/financial execution.
 */
export const CHESS_DEMO_SLUG = "chess-demo";
export const CHESS_DEMO_SCHEMA = "tenant_chess_demo";

export type DemoEnvironment = Record<string, string | undefined>;

export function validateChessDemoEnvironment(env: DemoEnvironment): {
  databaseUrl: string;
  ownerEmail: string;
} {
  if (env.NODE_ENV === "production") {
    throw new Error("CHESS demo setup is forbidden when NODE_ENV=production.");
  }
  if (env.NODE_ENV !== "development" && env.NODE_ENV !== "test") {
    throw new Error("CHESS demo requires NODE_ENV=development (or test for isolated tests).");
  }
  if (env.CHESS_DEMO_MODE !== "true") {
    throw new Error("Set CHESS_DEMO_MODE=true explicitly to enable fictional demo data.");
  }
  if (env.NEXT_PUBLIC_DEFAULT_TENANT !== CHESS_DEMO_SLUG) {
    throw new Error("Demo must use NEXT_PUBLIC_DEFAULT_TENANT=chess-demo.");
  }
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
      !env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Only Clerk TEST publishable and secret keys are accepted.");
  }

  // Even in a test-only Neon database the demo must refuse ANY external
  // execution/notification activation. No consent, licensed activity,
  // payment or vendor request is authorized by fictional fixtures.
  const prohibited = [
    "CHESS_BANK_POSTING_ENABLED","CHESS_BANK_FEED_ENABLED",
    "CHESS_BANK_FEED_IMPORT_ENABLED","CHESS_PAYROLL_EXECUTION_ENABLED",
    "CHESS_PAYROLL_APPROVAL_REQUESTS_ENABLED","CHESS_PAYROLL_STATUS_ENABLED",
    "CHESS_REGULATED_HANDOFF_ENABLED","CHESS_CALENDAR_SYNC_ENABLED",
    "CHESS_CALENDAR_OAUTH_ENABLED","CHESS_SCHEDULER_ENABLED",
    "CHESS_AI_TRIAGE_ENABLED","CHESS_BILLING_DELIVERY_ENABLED",
    "CHESS_BILLING_RECURRING_DRAFTS_ENABLED","CHESS_MERCHANT_WEBHOOK_ENABLED",
    "CHESS_AUDIT_EXPORT_ENABLED","CHESS_SCAN_CALLBACK_ENABLED",
    "CHESS_CLIENT_CONSENT_PORTAL_ENABLED","CHESS_DOCUMENT_LIFECYCLE_ENABLED",
    "CHESS_INCIDENT_MONITOR_ENABLED",
  ] as const;
  const active = prohibited.filter(key => env[key] === "true");
  if (active.length) {
    throw new Error("CHESS fictional demo refuses activated external services: " +
      active.join(", "));
  }
  const ownerEmail = (env.CHESS_DEMO_OWNER_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
    throw new Error("Set CHESS_DEMO_OWNER_EMAIL to your verified Clerk test-user email.");
  }
  let parsed: URL;
  try {
    parsed = new URL(env.DATABASE_URL ?? "");
  } catch {
    throw new Error("Set DATABASE_URL to a separate, non-pooled Neon chess_demo database.");
  }
  const dbName = decodeURIComponent(parsed.pathname.slice(1));
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("Demo requires a PostgreSQL URL.");
  }
  if (!parsed.hostname.endsWith(".neon.tech") ||
      parsed.hostname.split(".")[0]?.endsWith("-pooler") ||
      dbName !== "chess_demo" || parsed.searchParams.get("sslmode") !== "require") {
    throw new Error("Demo requires non-pooled Neon chess_demo with sslmode=require.");
  }
  if (parsed.searchParams.has("schema") &&
      parsed.searchParams.get("schema") !== "public") {
    throw new Error("Demo DATABASE_URL must use public as its base schema.");
  }
  if (!parsed.username || !parsed.password) {
    throw new Error("Demo DATABASE_URL must include the Neon database credentials.");
  }
  if (env.DIRECT_URL && env.DIRECT_URL !== env.DATABASE_URL) {
    throw new Error("For this isolated setup, omit DIRECT_URL or set it to the same non-pooled DATABASE_URL.");
  }
  return { databaseUrl: env.DATABASE_URL!, ownerEmail };
}

export function chessDemoModeActive(env: DemoEnvironment = process.env): boolean {
  if (env.CHESS_DEMO_MODE !== "true") return false;
  try {
    validateChessDemoEnvironment(env);
    return true;
  } catch {
    return false;
  }
}
