import { describe, expect, it } from "vitest";
import {
  unsubscribeKeys, sealUnsubscribeIdentity, openUnsubscribeIdentity,
  makeUnsubscribeUrl, validUnsubscribeIdentity,
} from "./public-unsubscribe-round54";
const first = Buffer.from("11".repeat(32), "hex");
const second = Buffer.from("22".repeat(32), "hex");

describe("Round 54 public unsub recipient possession", () => {
  it("only enables 32-byte AES keys from the secret manager", () => {
    expect(unsubscribeKeys()).toBeInstanceOf(Array);
    expect(unsubscribeKeys("weak")).toEqual([]);
    expect(unsubscribeKeys("11".repeat(32))).toHaveLength(1);
    expect(unsubscribeKeys("11".repeat(32) + "," + "22".repeat(32))).toHaveLength(2);
  });
  it("seals tenant+recipient as authenticated ciphertext; no PII in URL", () => {
    const token = sealUnsubscribeIdentity("chess-demo", " A@Example.com ", [first]);
    expect(token).toMatch(/^u1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain("example.com");
    expect(openUnsubscribeIdentity(token, [first])).toEqual({
      tenant: "chess-demo", email: "a@example.com",
    });
    expect(openUnsubscribeIdentity(token, [second])).toBeNull();
    expect(openUnsubscribeIdentity(token, [second, first])?.tenant).toBe("chess-demo");
    expect(openUnsubscribeIdentity(token + "junk", [first])).toBeNull();
  });
  it("refuses forged identity, malformed token and unsafe URL origin", () => {
    expect(validUnsubscribeIdentity("../tenant", "x@example.com")).toBeNull();
    expect(validUnsubscribeIdentity("valid", "bad-not-an-email")).toBeNull();
    expect(makeUnsubscribeUrl("chess-demo", "a@example.com",
      "https://example.test/app", [first])?.startsWith("https://example.test/unsubscribe?cap=u1.")).toBe(true);
    expect(makeUnsubscribeUrl("chess-demo", "a@example.com",
      "https://user:password@example.test", [first])).toBeNull();
    expect(makeUnsubscribeUrl("chess-demo", "a@example.com",
      "javascript:alert(1)", [first])).toBeNull();
  });
});
