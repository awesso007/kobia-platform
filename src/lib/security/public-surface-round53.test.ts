import { describe, expect, it } from "vitest";
import { publicSurfaceAction, publicSurfacePolicies } from "./public-surface-round53";
import { publicFormDigest, trustedPublicFormIp } from "./public-form-abuse";

describe("Round 53 public booking + analytics abuse policy", () => {
  it("isolates booking challenge actions from forms, tenants and booking pages", () => {
    const a = publicSurfaceAction("tenant-a", "calendar-a");
    expect(a).toMatch(/^booking_[a-f0-9]{20}$/);
    expect(a).not.toBe(publicSurfaceAction("tenant-a", "calendar-b"));
    expect(a).not.toBe(publicSurfaceAction("tenant-b", "calendar-a"));
    expect(a).not.toContain("calendar-a");
  });
  it("uses stricter quotas for booking submissions than passive analytics", () => {
    expect(publicSurfacePolicies.booking_submit.visitor)
      .toBeLessThan(publicSurfacePolicies.analytics_site.visitor);
    expect(publicSurfacePolicies.booking_submit.unknown)
      .toBeLessThan(publicSurfacePolicies.booking_submit.visitor);
    expect(publicSurfacePolicies.booking_manage.visitor)
      .toBeLessThan(publicSurfacePolicies.booking_slots.visitor);
    expect(publicSurfacePolicies.analytics_form.tenant).toBeLessThanOrEqual(1000);
  });
  it("never honors caller supplied XFF for separate visitor quota identities", () => {
    const h = new Headers({
      "x-forwarded-for": "203.0.113.6",
      "cf-connecting-ip": "203.0.113.9, 198.51.100.10",
    });
    expect(trustedPublicFormIp(h, "x-forwarded-for")).toBeNull();
    expect(trustedPublicFormIp(h, "cf-connecting-ip")).toBeNull();
    const hmac = publicFormDigest("private-test-secret-at-least-32-bytes!", "surface_visitor",
      "tenant", "booking_submit:page:203.0.113.9");
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac).not.toContain("203.0.113.9");
  });
});
