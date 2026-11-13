import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { admitPublicSurface } from "./public-surface-round53";
import { POST as siteTrack } from "@/app/api/sites/track/route";
import { POST as formTrack } from "@/app/api/f2/[slug]/track/route";

vi.mock("@/lib/security/public-surface-round53", () => ({
  admitPublicSurface: vi.fn(),
}));
function req(url: string, body: object) {
  return new NextRequest(url, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const siteDb = {
  site: { findUnique: vi.fn() },
  sitePage: { findFirst: vi.fn() },
  siteAnalytics: { create: vi.fn() },
};
const f2Db = {
  formV2: { findUnique: vi.fn() },
  formStep: { findFirst: vi.fn() },
  formV2Analytics: { create: vi.fn() },
};
describe("Round 53 untrusted analytics cannot bypass publication/ownership", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    siteDb.site.findUnique.mockResolvedValue({ id: "site-a", published: true } as never);
    siteDb.sitePage.findFirst.mockResolvedValue({ id: "page-a" } as never);
    siteDb.siteAnalytics.create.mockResolvedValue({ id: "event-a" } as never);
    f2Db.formV2.findUnique.mockResolvedValue({ id: "form-a", status: "PUBLISHED" } as never);
    f2Db.formStep.findFirst.mockResolvedValue({ id: "step-a" } as never);
    f2Db.formV2Analytics.create.mockResolvedValue({ id: "event-f" } as never);
  });
  it("records only published site and site-owned published page events", async () => {
    vi.mocked(admitPublicSurface).mockResolvedValue({ db: siteDb as never, ipHash: "hash" });
    const body = { siteId: "site-a", pageId: "page-a", eventType: "FORM_SUBMIT" };
    const okay = await siteTrack(req("https://example.test/api/sites/track?t=tenant", body));
    expect(okay.status).toBe(200);
    expect(siteDb.siteAnalytics.create).toHaveBeenCalledOnce();
    expect(siteDb.sitePage.findFirst).toHaveBeenCalledWith({
      where: { id: "page-a", siteId: "site-a", published: true }, select: { id: true },
    });
    siteDb.sitePage.findFirst.mockResolvedValueOnce(null as never);
    const foreign = await siteTrack(req("https://example.test/api/sites/track?t=tenant", body));
    expect(foreign.status).toBe(404);
    expect(siteDb.siteAnalytics.create).toHaveBeenCalledTimes(1);
  });
  it("does not write telemetry to unpublished sites or malformed event types", async () => {
    vi.mocked(admitPublicSurface).mockResolvedValue({ db: siteDb as never, ipHash: null });
    siteDb.site.findUnique.mockResolvedValueOnce({ id: "site-a", published: false } as never);
    const denied = await siteTrack(req("https://example.test/api/sites/track?t=tenant",
      { siteId: "site-a", eventType: "PAGEVIEW" }));
    expect(denied.status).toBe(404);
    const invalid = await siteTrack(req("https://example.test/api/sites/track?t=tenant",
      { siteId: "site-a", eventType: "ADMINISTRATIVE_ACTION" }));
    expect(invalid.status).toBe(400);
    expect(siteDb.siteAnalytics.create).not.toHaveBeenCalled();
  });
  it("rejects forged public form payment and submit success telemetry without any DB call", async () => {
    const denied = await formTrack(req("https://example.test/api/f2/form-a/track?t=tenant",
      { event: "PAYMENT_SUCCESS", stepId: "step-a" }), { params: { slug: "form-a" } });
    expect(denied.status).toBe(200);
    expect(admitPublicSurface).not.toHaveBeenCalled();
    expect(f2Db.formV2Analytics.create).not.toHaveBeenCalled();
  });
  it("requires published form and matching step ID before writing navigation analytics", async () => {
    vi.mocked(admitPublicSurface).mockResolvedValue({ db: f2Db as never, ipHash: null });
    f2Db.formV2.findUnique.mockResolvedValueOnce({ id: "form-a", status: "DRAFT" } as never);
    const r1 = await formTrack(req("https://example.test/api/f2/form-a/track?t=tenant",
      { event: "VIEW" }), { params: { slug: "form-a" } });
    expect(r1.status).toBe(200);
    f2Db.formStep.findFirst.mockResolvedValueOnce(null as never);
    const r2 = await formTrack(req("https://example.test/api/f2/form-a/track?t=tenant",
      { event: "STEP_ADVANCE", stepId: "foreign" }), { params: { slug: "form-a" } });
    expect(r2.status).toBe(200);
    expect(f2Db.formV2Analytics.create).not.toHaveBeenCalled();
    const r3 = await formTrack(req("https://example.test/api/f2/form-a/track?t=tenant",
      { event: "VIEW" }), { params: { slug: "form-a" } });
    expect(r3.status).toBe(200);
    expect(f2Db.formV2Analytics.create).toHaveBeenCalledOnce();
  });
});
