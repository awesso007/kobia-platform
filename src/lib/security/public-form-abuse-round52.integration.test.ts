/**
 * Real Postgres contention on the existing tenant-schema rate quota table.
 * CI creates and destroys this database. No vendor, Clerk or client identities.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { claimPublicFormQuota, PUBLIC_FORM_QUOTAS, publicFormDigest } from "./public-form-abuse";

const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;
integration("Round 52 distributed public forms: two PostgreSQL clients", () => {
  const key = "fictional-round52-rate-hmac-only-for-CI";
  const now = new Date("2020-02-10T14:09:13Z");
  const windowStart = new Date("2020-02-10T14:09:00Z");
  const tenant = "round52-fictional";
  let first: PrismaClient;
  let second: PrismaClient;
  beforeAll(async () => {
    first = new PrismaClient();
    second = new PrismaClient();
    await Promise.all([first.$connect(), second.$connect()]);
  });
  afterAll(async () => {
    if (first) await first.chessRequestRateWindow.deleteMany({
      where: { scope: "PUBLIC_FORM_SUBMIT_V1", windowStart },
    });
    await Promise.all([first?.$disconnect(), second?.$disconnect()]);
  });

  it("permits exactly the visitor quota across independent clients under parallel load", async () => {
    const input = {
      tenant, kind: "v2" as const, form: "parallel",
      clientIp: "203.0.113.77", rateKey: key, now,
    };
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) =>
      claimPublicFormQuota(i % 2 ? second : first, input)));
    expect(attempts.filter(x => x.status === "fulfilled")).toHaveLength(PUBLIC_FORM_QUOTAS.visitor);
    const failures = attempts.filter(x => x.status === "rejected");
    expect(failures).toHaveLength(12 - PUBLIC_FORM_QUOTAS.visitor);
    for (const failure of failures) {
      if (failure.status === "rejected") expect(failure.reason).toMatchObject({ status: 429 });
    }
    const visitor = publicFormDigest(key, "visitor", tenant, "v2:parallel:203.0.113.77");
    const row = await first.chessRequestRateWindow.findUnique({
      where: { scope_subjectDigest_windowStart: {
        scope: "PUBLIC_FORM_SUBMIT_V1", subjectDigest: visitor, windowStart,
      } },
    });
    expect(row?.hits).toBe(PUBLIC_FORM_QUOTAS.visitor);
    expect(row?.subjectDigest).not.toContain("203.0.113.77");
  });
  it("isolates tenant, form and unknown visitor quotas", async () => {
    const base = { tenant, kind: "legacy" as const, form: "unknown", clientIp: null,
      rateKey: key, now };
    const attempts = await Promise.allSettled(Array.from({ length: 5 }, () =>
      claimPublicFormQuota(first, base)));
    expect(attempts.filter(x => x.status === "fulfilled")).toHaveLength(PUBLIC_FORM_QUOTAS.unknown);
    await expect(claimPublicFormQuota(second, { ...base, form: "other-form" })).resolves.toBeUndefined();
    await expect(claimPublicFormQuota(second, { ...base, tenant: "another-tenant" })).resolves.toBeUndefined();
  });
});
