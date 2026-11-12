import { describe, expect, it } from "vitest";
import { issueLegacyTrackingCapability, verifyLegacyTrackingCapability } from "./legacy-tracking-capability";

const key = "isolated-test-only-tracking-key-at-least-32-bytes";
const r = "ckp7bw8zz0000s1ez";
describe("Round 48 signed public tracking capabilities", () => {
  it("issues and validates purpose, recipient, expiry and tenant-bound open", () => {
    const token = issueLegacyTrackingCapability({ p: "OPEN", t: "chess-demo", r, ttlSeconds: 10 }, key, 100)!;
    expect(token).toBeTruthy();
    expect(verifyLegacyTrackingCapability(token, "OPEN", r, key, 105)?.t).toBe("chess-demo");
    expect(verifyLegacyTrackingCapability(token, "OPEN", r, key, 111)).toBeNull();
    expect(verifyLegacyTrackingCapability(token, "CLICK", r, key, 105)).toBeNull();
    expect(verifyLegacyTrackingCapability(token, "OPEN", r + "a", key, 105)).toBeNull();
    expect(verifyLegacyTrackingCapability(token.slice(0, -1) + "!", "OPEN", r, key, 105)).toBeNull();
  });
  it("only redirects to signed http(s) destinations, never caller query values", () => {
    const url = "https://example.org/resource?id=1";
    const token = issueLegacyTrackingCapability({ p: "CLICK", t: "chess-demo", r, url }, key, 100)!;
    expect(verifyLegacyTrackingCapability(token, "CLICK", r, key, 101)?.url).toBe(url);
    expect(issueLegacyTrackingCapability({ p: "CLICK", t: "chess-demo", r, url: "javascript:alert(1)" }, key)).toBeNull();
    expect(issueLegacyTrackingCapability({ p: "CLICK", t: "chess-demo", r, url: "https://user:password@example.org" }, key)).toBeNull();
    expect(issueLegacyTrackingCapability({ p: "OPEN", t: "chess-demo", r }, "short")).toBeNull();
    expect(verifyLegacyTrackingCapability(token, "CLICK", r, "short", 101)).toBeNull();
  });
});
