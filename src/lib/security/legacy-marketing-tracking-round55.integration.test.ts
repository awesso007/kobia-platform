/**
 * Disposable PostgreSQL: tracked email receipt must not change after opt-out,
 * and two application connections must not double-mark a single open.
 */
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
import { recordSignedLegacyTracking } from "./legacy-marketing-tracking-round55";
const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;

integration("Round 55 signed tracking and opt-out consistency", () => {
  let one: PrismaClient;
  let two: PrismaClient;
  let broadcastId = "";
  let recipientId = "";
  const email = "round55-" + randomUUID() + "@fictional.test";
  beforeAll(async () => {
    one = new PrismaClient(); two = new PrismaClient();
    await Promise.all([one.$connect(), two.$connect()]);
    const broadcast = await one.broadcast.create({
      data: { name: "Round 55 fictional tracking" }, select: { id: true },
    });
    broadcastId = broadcast.id;
    const recipient = await one.broadcastRecipient.create({
      data: { broadcastId, email, status: "SENT" },
      select: { id: true },
    });
    recipientId = recipient.id;
  });
  afterAll(async () => {
    if (one) {
      await one.unsubscribe.deleteMany({ where: { email } });
      if (broadcastId) await one.broadcast.deleteMany({ where: { id: broadcastId } });
    }
    await Promise.all([one?.$disconnect(), two?.$disconnect()]);
  });
  it("allows one open then one click, but never reverts CLICKED to OPENED", async () => {
    expect(await recordSignedLegacyTracking(one, recipientId, "OPEN")).toBe(true);
    expect(await recordSignedLegacyTracking(one, recipientId, "OPEN")).toBe(false);
    expect(await recordSignedLegacyTracking(one, recipientId, "CLICK")).toBe(true);
    expect(await recordSignedLegacyTracking(one, recipientId, "OPEN")).toBe(false);
    const r=await one.broadcastRecipient.findUniqueOrThrow({where:{id:recipientId}});
    expect(r.status).toBe("CLICKED");
    expect(r.openedAt).not.toBeNull();
    expect(r.clickedAt).not.toBeNull();
  });
  it("refuses telemetry after a recipient has unsubscribed, even on previously sent mail", async () => {
    await one.broadcastRecipient.update({
      where: { id: recipientId }, data: { status: "SENT", openedAt: null, clickedAt: null },
    });
    await one.unsubscribe.create({data:{email,source:"PORTAL"}});
    expect(await recordSignedLegacyTracking(one, recipientId, "OPEN")).toBe(false);
    expect(await recordSignedLegacyTracking(two, recipientId, "CLICK")).toBe(false);
    const r=await one.broadcastRecipient.findUniqueOrThrow({where:{id:recipientId}});
    expect(r.status).toBe("SENT");
    expect(r.openedAt).toBeNull();
    expect(r.clickedAt).toBeNull();
  });
  it("never accepts two concurrent opened transitions across separate DB clients", async () => {
    await one.unsubscribe.deleteMany({where:{email}});
    const result = await Promise.allSettled([
      recordSignedLegacyTracking(one, recipientId, "OPEN"),
      recordSignedLegacyTracking(two, recipientId, "OPEN"),
    ]);
    expect(result.filter(r=>r.status==="fulfilled" && r.value)).toHaveLength(1);
    expect(await one.broadcastRecipient.findUniqueOrThrow({where:{id:recipientId}}))
      .toMatchObject({status:"OPENED"});
  });
});
