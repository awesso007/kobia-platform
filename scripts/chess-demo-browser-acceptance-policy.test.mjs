import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { assertSafeChessDemoBrowserEnvironment } from "../e2e/demo-harness.mjs";

const target = "http://127.0.0.1:3000";
const safe = {
  NODE_ENV: "development",
  CHESS_DEMO_MODE: "true",
  NEXT_PUBLIC_DEFAULT_TENANT: "chess-demo",
  CLERK_PUBLISHABLE_KEY: "pk_test_example",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
  CLERK_SECRET_KEY: "sk_test_example",
  DATABASE_URL: "postgresql://demo:never-log@demo.neon.tech/chess_demo?sslmode=require",
  DIRECT_URL: "postgresql://demo:never-log@demo.neon.tech/chess_demo?sslmode=require",
  CHESS_DEMO_OWNER_EMAIL: "owner+clerk_test@example.test",
  CHESS_DEMO_EMPLOYEE_EMAIL: "employee+clerk_test@example.test",
  CHESS_DEMO_CLIENT_EMAIL: "client+clerk_test@example.test",
};

test("Clerk browser preflight allows only a local, isolated, test-only fixture", () => {
  assert.deepEqual(assertSafeChessDemoBrowserEnvironment(safe, target),
    { baseURL: target });
});

test("browser preflight rejects a live or mismatched Clerk environment", () => {
  for (const changes of [
    { CLERK_SECRET_KEY: "sk_live_production" },
    { CLERK_PUBLISHABLE_KEY: "pk_live_production" },
    { CLERK_PUBLISHABLE_KEY: "pk_test_different-instance" },
    { NODE_ENV: "production" },
    { CHESS_DEMO_MODE: "false" },
    { NEXT_PUBLIC_DEFAULT_TENANT: "kobia" },
  ]) {
    assert.throws(() => assertSafeChessDemoBrowserEnvironment({
      ...safe, ...changes
    }, target));
  }
});

test("browser preflight rejects live, pooled, wrong-database and remote targets", () => {
  for (const url of [
    "postgresql://demo:pw@demo.neon.tech/production?sslmode=require",
    "postgresql://demo:pw@demo-pooler.neon.tech/chess_demo?sslmode=require",
    "postgresql://demo:pw@localhost/chess_demo?sslmode=require",
    "postgresql://demo:pw@demo.neon.tech/chess_demo?sslmode=disable",
  ]) {
    assert.throws(() => assertSafeChessDemoBrowserEnvironment({
      ...safe, DATABASE_URL: url, DIRECT_URL: url,
    }, target));
  }
  for (const origin of [
    "https://kobia-platform.vercel.app",
    "http://127.0.0.1:3001",
    "http://example.com:3000",
    "http://127.0.0.1:3000/portal",
  ]) assert.throws(() => assertSafeChessDemoBrowserEnvironment(safe, origin));
});

test("browser preflight rejects duplicate identities and live provider switches", () => {
  assert.throws(() => assertSafeChessDemoBrowserEnvironment({
    ...safe, CHESS_DEMO_CLIENT_EMAIL: safe.CHESS_DEMO_OWNER_EMAIL,
  }, target));
  assert.throws(() => assertSafeChessDemoBrowserEnvironment({
    ...safe, CHESS_BANK_POSTING_ENABLED: "true",
  }, target));
  assert.throws(() => assertSafeChessDemoBrowserEnvironment({
    ...safe, CHESS_CLIENT_PORTAL_POLICY_APPROVED: "true",
  }, target));
});

test("protected workflow actually interpolates secrets and never deploys", () => {
  const source=readFileSync(".github/workflows/chess-demo-browser-e2e.yml","utf8");
  assert.doesNotMatch(source,/\\\$\{\{/);
  assert.match(source,/secrets\.CLERK_SECRET_KEY/);
  assert.match(source,/secrets\.DATABASE_URL/);
  assert.match(source,/refs\/heads\/feature\/operations-overview/);
  assert.match(source,/environment: chess-demo-e2e/);
  assert.doesNotMatch(source,/vercel\/deploy|actions\/deploy|git push|gh pr merge/);
});
