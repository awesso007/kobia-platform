/**
 * Cross-process-style contention across two independent Prisma connections to
 * one disposable tenant PostgreSQL schema. No real visitors or vendor tokens.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { claimPublicSurfaceQuota, publicSurfacePolicies } from "./public-surface-round53";
import { publicFormDigest } from "./public-form-abuse";

const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;
integration("Round 53 booking and analytics quotas with real PostgreSQL", () => {
  const tenant = "round53-fictional";
  const rateKey = "round53-fictional-tests-only-not-production!";
  const now = new Date("2020-02-11T12:11:33Z");
  const windowStart = new Date("2020-02-11T12:11:00Z");
  let a: PrismaClient;
  let b: PrismaClient;
  beforeAll(async () => {
    a = new PrismaClient();
    b = new PrismaClient();
    await Promise.all([a.$connect(), b.$connect()]);
  });
  afterAll(async () => {
    if (a) await a.chessRequestRateWindow.deleteMany({
      where: { scope: "CHESS_PUBLIC_SURFACE_R53", windowStart },
    });
    await Promise.all([a?.$disconnect(), b?.$disconnect()]);
  });
  it("enforces an exact booking visitor limit across parallel independent clients", async () => {
    const input = {
      tenant, kind: "booking_submit" as const, resource: "fictional-page",
      clientIp: "203.0.113.100", rateKey, now,
    };
    const attempts = await Promise.allSettled(Array.from({ length: 9 }, (_, i) =>
      claimPublicSurfaceQuota(i % 2 ? a : b, input)));
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(
      publicSurfacePolicies.booking_submit.visitor);
    const denied = attempts.filter(r => r.status === "rejected");
    expect(denied).toHaveLength(9 - publicSurfacePolicies.booking_submit.visitor);
    for (const r of denied) if (r.status === "rejected") expect(r.reason)
      .toMatchObject({ status: 429 });
    const visitorKey = publicFormDigest(rateKey, "surface_visitor", tenant,
      "booking_submit:fictional-page:203.0.113.100");
    const row = await a.chessRequestRateWindow.findUnique({
      where: { scope_subjectDigest_windowStart: {
        scope: "CHESS_PUBLIC_SURFACE_R53", subjectDigest: visitorKey, windowStart,
      } },
    });
    expect(row?.hits).toBe(publicSurfacePolicies.booking_submit.visitor);
    const tenantKey = publicFormDigest(rateKey, "surface_tenant", tenant, "booking_submit");
    const tenantRow = await a.chessRequestRateWindow.findUnique({
      where: { scope_subjectDigest_windowStart: {
        scope: "CHESS_PUBLIC_SURFACE_R53", subjectDigest: tenantKey, windowStart,
      } },
    });
    // Four rejected calls must have rolled back *all* counters.
    expect(tenantRow?.hits).toBe(publicSurfacePolicies.booking_submit.visitor);
  });
  it("does not mix analytics and booking windows or tenant/resource identities", async () => {
    const base = {
      tenant, kind: "analytics_site" as const,
      resource: "published-site", clientIp: null, rateKey, now,
    };
    const hits = await Promise.allSettled(Array.from({ length: 11 }, (_, i) =>
      claimPublicSurfaceQuota(i % 2 ? a : b, base)));
    expect(hits.filter(x => x.status === "fulfilled"))
      .toHaveLength(publicSurfacePolicies.analytics_site.unknown);
    await expect(claimPublicSurfaceQuota(a, { ...base, resource: "another-site" }))
      .resolves.toBeUndefined();
    await expect(claimPublicSurfaceQuota(b, { ...base, tenant: "other-tenant" }))
      .resolves.toBeUndefined();
    await expect(claimPublicSurfaceQuota(a, {
      ...base, kind: "analytics_form", resource: "published-form",
    })).resolves.toBeUndefined();
  });
});
