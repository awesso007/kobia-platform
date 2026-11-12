import { describe, expect, it } from "vitest";
import { cronAuthorizationDecision, requireKobiaCronAuth } from "./cron-authorization";

const secret = "a-valid-isolated-only-cron-secret-with-48-characters";
function request(authorization?: string, cookie?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://example.invalid/api/cron/notifications", { headers });
}

describe("Round 47: machine cron authorization", () => {
  it("fails closed when the secret is absent or weaker than 32 bytes", async () => {
    for (const configured of [undefined, "", "short"]) {
      const blocked = requireKobiaCronAuth(request(`Bearer ${configured ?? ""}`), configured);
      expect(blocked?.status).toBe(503);
      expect(blocked?.headers.get("cache-control")).toBe("no-store");
      expect(await blocked?.json()).toEqual({ error: "Scheduler unavailable" });
    }
  });
  it("accepts only an exact Vercel Bearer secret", () => {
    expect(cronAuthorizationDecision(request(`Bearer ${secret}`), secret)).toBe("AUTHORIZED");
    expect(requireKobiaCronAuth(request(`Bearer ${secret}`), secret)).toBeNull();
    // Request Headers normalizes outer whitespace, so use altered internal separators.
    for (const candidate of [
      undefined, "", `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`,
      `Basic ${secret}`, `bearer ${secret}`, secret,
      `Bearer  ${secret}`, `Bearer${secret}`,
    ]) {
      expect(cronAuthorizationDecision(request(candidate), secret)).toBe("UNAUTHORIZED");
    }
  });
  it("never treats a Clerk cookie, query string, or local request as machine authentication", async () => {
    const denied = requireKobiaCronAuth(request(undefined, "__session=fake"), secret);
    expect(denied?.status).toBe(401);
    expect(denied?.headers.get("cache-control")).toBe("no-store");
    expect(await denied?.json()).toEqual({ error: "Unauthorized" });
  });
});
