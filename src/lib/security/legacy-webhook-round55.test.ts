import { describe, expect, it } from "vitest";
import {
  registeredWebhookSchema, validatedWebhookTenantSlug,
} from "./legacy-webhook-tenant";

describe("Round 55 canonical platform registry boundary", () => {
  it("accepts only exact ACTIVE tenant and the canonical schema", () => {
    const good={status:"ACTIVE",schemaName:"tenant_chess_demo"};
    expect(validatedWebhookTenantSlug("chess-demo")).toBe("chess-demo");
    expect(registeredWebhookSchema("chess-demo",good)).toBe("tenant_chess_demo");
    expect(registeredWebhookSchema("chess-demo",null)).toBeNull();
    expect(registeredWebhookSchema("chess-demo",{...good,status:"SUSPENDED"})).toBeNull();
    expect(registeredWebhookSchema("chess-demo",{...good,schemaName:"tenant_other"})).toBeNull();
  });
  it("does not allow unsafe slugs to reach schema resolver", () => {
    for (const bad of ["", "../a", "Admin", "name' OR 1=1", "a_b", "a".repeat(60)])
      expect(registeredWebhookSchema(bad,{status:"ACTIVE",schemaName:"tenant_chess_demo"})).toBeNull();
  });
});
