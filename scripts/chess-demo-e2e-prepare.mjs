import { writeFileSync } from "node:fs";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required in the protected chess-demo-e2e environment.");
  return value;
}

function normalizedEmail(name) {
  const value = required(name).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.endsWith(".invalid")) {
    throw new Error(name + " must be a real verified Clerk TEST-user email, not a placeholder.");
  }
  return value;
}

if (process.env.NODE_ENV !== "development" ||
    process.env.CHESS_DEMO_MODE !== "true" ||
    process.env.NEXT_PUBLIC_DEFAULT_TENANT !== "chess-demo") {
  throw new Error("Browser acceptance requires NODE_ENV=development, CHESS_DEMO_MODE=true and NEXT_PUBLIC_DEFAULT_TENANT=chess-demo.");
}

const publishableKey = required("CLERK_PUBLISHABLE_KEY");
const secretKey = required("CLERK_SECRET_KEY");
if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) {
  throw new Error("Browser acceptance accepts only Clerk development/test keys.");
}

const emails = [
  normalizedEmail("CHESS_DEMO_OWNER_EMAIL"),
  normalizedEmail("CHESS_DEMO_EMPLOYEE_EMAIL"),
  normalizedEmail("CHESS_DEMO_CLIENT_EMAIL"),
];
if (new Set(emails).size !== emails.length) {
  throw new Error("Owner, employee and client Clerk test identities must be distinct.");
}

const databaseUrl = required("DATABASE_URL");
let database;
try {
  database = new URL(databaseUrl);
} catch {
  throw new Error("DATABASE_URL must be a valid non-pooled Neon URL for chess_demo.");
}
const databaseName = decodeURIComponent(database.pathname.slice(1));
if (!["postgres:", "postgresql:"].includes(database.protocol) ||
    !database.hostname.endsWith(".neon.tech") ||
    database.hostname.split(".")[0]?.endsWith("-pooler") ||
    databaseName !== "chess_demo" ||
    database.searchParams.get("sslmode") !== "require" ||
    !database.username || !database.password) {
  throw new Error("Refusing browser setup: DATABASE_URL must be non-pooled Neon chess_demo with sslmode=require.");
}
if (process.env.DIRECT_URL && process.env.DIRECT_URL !== databaseUrl) {
  throw new Error("DIRECT_URL must be omitted or identical to the isolated demo DATABASE_URL.");
}

const baseUrl = required("CHESS_DEMO_E2E_BASE_URL");
let local;
try {
  local = new URL(baseUrl);
} catch {
  throw new Error("CHESS_DEMO_E2E_BASE_URL must be local http://127.0.0.1:3000.");
}
if (local.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(local.hostname) ||
    local.port !== "3000" || local.pathname !== "/" ||
    local.search || local.hash || local.username || local.password) {
  throw new Error("Browser tests may target only local http://127.0.0.1:3000 or http://localhost:3000.");
}

const activated = Object.entries(process.env)
  .filter(([name, value]) =>
    name.startsWith("CHESS_") &&
    /(?:ENABLED|APPROVED|CERTIFIED)$/.test(name) &&
    value === "true")
  .map(([name]) => name);
if (activated.length) {
  throw new Error("Demo browser acceptance refuses activated external service/policy switches: " + activated.join(", "));
}

const values = {
  NODE_ENV: "development",
  CHESS_DEMO_MODE: "true",
  NEXT_PUBLIC_DEFAULT_TENANT: "chess-demo",
  NEXT_PUBLIC_ROOT_DOMAIN: "kobia.ai",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/chess-demo/login",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/app/overview",
  NEXT_PUBLIC_APP_URL: local.origin,
  CHESS_PUBLIC_ORIGIN: local.origin,
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey,
  CLERK_PUBLISHABLE_KEY: publishableKey,
  CLERK_SECRET_KEY: secretKey,
  CHESS_DEMO_OWNER_EMAIL: emails[0],
  CHESS_DEMO_EMPLOYEE_EMAIL: emails[1],
  CHESS_DEMO_CLIENT_EMAIL: emails[2],
};

writeFileSync(
  ".env.local",
  Object.entries(values).map(([name, value]) => name + "=" + JSON.stringify(value)).join("\n") + "\n",
  { mode: 0o600 },
);
console.log("Prepared isolated CHESS demo browser-test environment. Secret values were not printed.");
