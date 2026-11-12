import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("./chess-demo-e2e-prepare.mjs", import.meta.url));
const secret = "demo-only-neon-password-never-log";

const safeEnv = {
  NODE_ENV: "development",
  CHESS_DEMO_MODE: "true",
  NEXT_PUBLIC_DEFAULT_TENANT: "chess-demo",
  DATABASE_URL: "postgresql://demo:" + secret + "@chess-demo.neon.tech/chess_demo?sslmode=require",
  DIRECT_URL: "postgresql://demo:" + secret + "@chess-demo.neon.tech/chess_demo?sslmode=require",
  CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CLERK_SECRET_KEY: "sk_test_example",
  CHESS_DEMO_OWNER_EMAIL: "owner@chess-e2e.example",
  CHESS_DEMO_EMPLOYEE_EMAIL: "employee@chess-e2e.example",
  CHESS_DEMO_CLIENT_EMAIL: "client@chess-e2e.example",
  CHESS_DEMO_E2E_BASE_URL: "http://127.0.0.1:3000",
};

function run(overrides = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "chess-demo-e2e-policy-"));
  const env = { ...process.env, ...safeEnv, ...overrides };
  for (const key of Object.keys(env)) {
    if (/^CHESS_.*_(ENABLED|APPROVED|CERTIFIED)$/.test(key) && !(key in overrides)) {
      delete env[key];
    }
  }
  const result = spawnSync(process.execPath, [script], {
    cwd, env, encoding: "utf8", timeout: 5000,
  });
  const file = join(cwd, ".env.local");
  const written = existsSync(file) ? readFileSync(file, "utf8") : null;
  rmSync(cwd, { recursive: true, force: true });
  return { result, written };
}

test("prepares a local test-only environment without printing secrets", () => {
  const { result, written } = run();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(written?.includes("CHESS_DEMO_EMPLOYEE_EMAIL"));
  assert.ok(written?.includes("CHESS_DEMO_CLIENT_EMAIL"));
  assert.equal(result.stdout.includes(secret), false);
  assert.equal(result.stderr.includes(secret), false);
});

test("refuses production and live Clerk credentials", () => {
  const production = run({ NODE_ENV: "production" });
  assert.notEqual(production.result.status, 0);
  assert.match(production.result.stderr, /NODE_ENV=development/);
  const live = run({
    CLERK_PUBLISHABLE_KEY: "pk_live_not-allowed",
    CLERK_SECRET_KEY: "sk_live_not-allowed",
  });
  assert.notEqual(live.result.status, 0);
  assert.match(live.result.stderr, /Clerk development\/test keys/);
});

test("refuses pooled, wrong-database and non-Neon targets", () => {
  for (const DATABASE_URL of [
    "postgresql://demo:secret@chess-demo-pooler.neon.tech/chess_demo?sslmode=require",
    "postgresql://demo:secret@chess-demo.neon.tech/production?sslmode=require",
    "postgresql://demo:secret@localhost:5432/chess_demo?sslmode=require",
  ]) {
    const outcome = run({ DATABASE_URL, DIRECT_URL: DATABASE_URL });
    assert.notEqual(outcome.result.status, 0);
    assert.match(outcome.result.stderr, /non-pooled Neon chess_demo/);
  }
});

test("refuses duplicate test identities and remote browser targets", () => {
  const duplicate = run({ CHESS_DEMO_CLIENT_EMAIL: "owner@chess-e2e.example" });
  assert.notEqual(duplicate.result.status, 0);
  assert.match(duplicate.result.stderr, /must be distinct/);
  const remote = run({ CHESS_DEMO_E2E_BASE_URL: "https://production.example.com" });
  assert.notEqual(remote.result.status, 0);
  assert.match(remote.result.stderr, /only local http/);
});

test("refuses enabled external service and approval switches", () => {
  const outcome = run({ CHESS_BANK_POSTING_ENABLED: "true" });
  assert.notEqual(outcome.result.status, 0);
  assert.match(outcome.result.stderr, /refuses activated external service\/policy switches/);
});
