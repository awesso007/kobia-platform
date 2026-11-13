import { describe, expect, it } from "vitest";
import { validatedWebhookTenantSlug, registeredWebhookSchema } from "./legacy-webhook-tenant";

describe("Round 48 signed Twilio webhook tenant boundary", () => {
  it("requires exact safe lower-case non-empty tenant slug", () => {
    expect(validatedWebhookTenantSlug("chess-demo")).toBe("chess-demo");
    for (const value of [null, "", "ACME", "tenant_one", "../acme", "acme.evil", "acme/", "-acme", "acme-", "acme,other", "a".repeat(52)]) {
      expect(validatedWebhookTenantSlug(value)).toBeNull();
    }
  });
  it("enforces active registry and exact tenant schema", () => {
    expect(registeredWebhookSchema("chess-demo", { status: "ACTIVE", schemaName: "tenant_chess_demo" })).toBe("tenant_chess_demo");
    for (const row of [null, { status: "SUSPENDED", schemaName: "tenant_chess_demo" }, { status: "ACTIVE", schemaName: "tenant_acme" }]) {
      expect(registeredWebhookSchema("chess-demo", row)).toBeNull();
    }
  });
});
