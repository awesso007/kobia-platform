import { describe, expect, it } from "vitest";
import { chessDemoModeActive, validateChessDemoEnvironment } from "./demo-mode";

const safe = {
  NODE_ENV: "development",
  CHESS_DEMO_MODE: "true",
  NEXT_PUBLIC_DEFAULT_TENANT: "chess-demo",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_fictional",
  CLERK_SECRET_KEY: "sk_test_fictional",
  CHESS_DEMO_OWNER_EMAIL: "owner@example.test",
  DATABASE_URL: "postgresql://demo:fictional@ep-fictional.us-east-1.aws.neon.tech/chess_demo?sslmode=require",
};

describe("isolated CHESS Codespaces demo", () => {
  it("requires all explicit sandbox controls", () => {
    expect(chessDemoModeActive(safe)).toBe(true);
    for (const key of Object.keys(safe)) {
      expect(chessDemoModeActive({ ...safe, [key]: undefined })).toBe(false);
    }
  });
  it("refuses production even when test keys and flags are set", () => {
    const prod = { ...safe, NODE_ENV: "production" };
    expect(chessDemoModeActive(prod)).toBe(false);
    expect(() => validateChessDemoEnvironment(prod)).toThrow(/forbidden/);
  });
  it("refuses pooled or other databases and any live Clerk key", () => {
    expect(chessDemoModeActive({ ...safe,
      DATABASE_URL: safe.DATABASE_URL.replace("ep-fictional.", "ep-fictional-pooler."),
    })).toBe(false);
    expect(chessDemoModeActive({ ...safe,
      DATABASE_URL: safe.DATABASE_URL.replace("/chess_demo", "/neondb"),
    })).toBe(false);
    expect(chessDemoModeActive({ ...safe, CLERK_SECRET_KEY: "sk_live_forbidden" })).toBe(false);
    expect(chessDemoModeActive({ ...safe, DIRECT_URL: "postgresql://other" })).toBe(false);
  });
});
