import { describe, it, expect } from "vitest";
import { inboundMailTenantSlug, inboundMailCredentialDecision } from "./legacy-inbound-mail";

describe("Round 48 inbound machine mail boundary", () => {
  it("accepts exactly one valid tenant alias under the approved host", () => {
    expect(inboundMailTenantSlug("KOBIA+Chess-Demo@Inbound.Kobia.AI")).toBe("chess-demo");
    expect(inboundMailTenantSlug("kobia+two@relay.example", "relay.example")).toBe("two");
  });
  it("rejects partial domains, empty tenant, injected routing and fallback", () => {
    for (const value of [
      "", "contact@example.com", "kobia+@inbound.kobia.ai",
      "attacker+kobia+acme@inbound.kobia.ai", "kobia+acme@inbound.kobia.ai.evil.test",
      "kobia+acme@inbound.kobia.ai, second@example.com",
      "kobia+bad_slug@inbound.kobia.ai", "kobia+bad--@inbound.kobia.ai",
      "kobia+foo@other.example", "kobia+acme@foo.inbound.kobia.ai",
    ]) expect(inboundMailTenantSlug(value)).toBeNull();
    expect(inboundMailTenantSlug("kobia+valid@relay.example", "")).toBeNull();
  });
  it("requires a nonempty strong exact relay credential", () => {
    const key = "relay-development-only-random-like-key-123456789012345";
    expect(inboundMailCredentialDecision(key, key)).toBe("AUTHORIZED");
    for (const bad of ["", "short", undefined]) expect(inboundMailCredentialDecision(key, bad)).toBe("UNCONFIGURED");
    for (const bad of [null, "", "another", key + "z", key.slice(0, -1)]) {
      expect(inboundMailCredentialDecision(bad, key)).toBe("UNAUTHORIZED");
    }
  });
});
