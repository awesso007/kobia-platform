import { describe, expect, it, vi } from "vitest";
import {
  publicFormConfig, publicFormAction, publicFormDigest, publicFormWindow,
  trustedPublicFormIp, publicFormErrorResponse, PublicFormGateError,
  readPublicFormBody, verifyPublicFormChallenge,
} from "./public-form-abuse";
const key = "r".repeat(36);
const env = {
  CHESS_PUBLIC_FORM_ABUSE_ENABLED: "true",
  CHESS_PUBLIC_FORM_RATE_HASH_KEY: key,
  CHESS_TURNSTILE_SECRET_KEY: "s".repeat(36),
  NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY: "site-key-sandbox-only",
  CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER: "cf-connecting-ip",
  CHESS_TURNSTILE_ALLOWED_HOSTNAMES: "forms.example.test,preview.example.test",
};
describe("Round 52 distributed public form security", () => {
  it("requires explicit feature activation, strong keys and exact pinned hostnames", () => {
    expect(publicFormConfig(env as NodeJS.ProcessEnv)?.hostnames).toHaveLength(2);
    for (const patch of [
      { CHESS_PUBLIC_FORM_ABUSE_ENABLED: "false" },
      { CHESS_PUBLIC_FORM_RATE_HASH_KEY: "weak" },
      { CHESS_TURNSTILE_SECRET_KEY: "" },
      { NEXT_PUBLIC_CHESS_TURNSTILE_SITE_KEY: "" },
      { CHESS_PUBLIC_FORM_TRUSTED_IP_HEADER: "x-forwarded-for" },
      { CHESS_TURNSTILE_ALLOWED_HOSTNAMES: "*.example.test" },
    ]) expect(publicFormConfig({ ...env, ...patch } as NodeJS.ProcessEnv)).toBeNull();
  });
  it("refuses arbitrary X-Forwarded-For IP chains and does not store raw IPs", () => {
    const h = new Headers({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" });
    expect(trustedPublicFormIp(h, "cf-connecting-ip")).toBe("203.0.113.7");
    expect(trustedPublicFormIp(h, "x-forwarded-for")).toBeNull();
    expect(trustedPublicFormIp(new Headers({
      "cf-connecting-ip": "1.2.3.4, 5.6.7.8",
    }), "cf-connecting-ip")).toBeNull();
    const digest = publicFormDigest(key, "visitor", "a", "203.0.113.7");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("203.0.113.7");
    expect(digest).not.toBe(publicFormDigest(key, "visitor", "b", "203.0.113.7"));
  });
  it("binds challenge action to kind/tenant/form and uses UTC minute windows", () => {
    expect(publicFormAction("legacy", "a", "form")).toMatch(/^form_[0-9a-f]{20}$/);
    expect(publicFormAction("legacy", "a", "form"))
      .not.toBe(publicFormAction("v2", "a", "form"));
    expect(publicFormWindow(new Date("2026-11-12T22:15:37Z")).toISOString())
      .toBe("2026-11-12T22:15:00.000Z");
  });
  it("validates Siteverify action and hostname and denies provider outage", async () => {
    const action = publicFormAction("v2", "t", "f");
    const validate = (result: unknown) =>
      vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
    const okay = validate({ success: true, action, hostname: "forms.example.test" });
    expect(await verifyPublicFormChallenge({ token: "valid-token", secret: "private", action,
      hostnames: ["forms.example.test"] }, okay as typeof fetch)).toBe(true);
    for (const value of [
      { success: false, action, hostname: "forms.example.test" },
      { success: true, action: "wrong", hostname: "forms.example.test" },
      { success: true, action, hostname: "evil.test" },
    ]) expect(await verifyPublicFormChallenge({ token: "candidate", secret: "private",
      action, hostnames: ["forms.example.test"] }, validate(value) as typeof fetch)).toBe(false);
    expect(await verifyPublicFormChallenge({ token: "", secret: "private",
      action, hostnames: ["forms.example.test"] }, okay as typeof fetch)).toBe(false);
    expect(await verifyPublicFormChallenge({ token: "candidate", secret: "private",
      action, hostnames: ["forms.example.test"] }, vi.fn(async () => {
      throw Error("offline");
    }) as typeof fetch)).toBe(false);
  });
  it("bounds request bytes and returns Retry-After for quotas", async () => {
    const req = new Request("https://example.test", { method: "POST",
      body: '{"values":{"name":"ok"}}' });
    expect(new TextDecoder().decode(await readPublicFormBody(req))).toContain("ok");
    const big = new Request("https://example.test", { method: "POST", body: "x".repeat(33000) });
    await expect(readPublicFormBody(big)).rejects.toMatchObject({ status: 403 });
    expect(publicFormErrorResponse(new PublicFormGateError(429, "Slow down.")))
      .toEqual({ status: 429, message: "Slow down.", retryAfter: "60" });
    expect(publicFormErrorResponse(Error("internal secret"))).toEqual({
      status: 503, message: "Form temporarily unavailable.",
    });
  });
});
