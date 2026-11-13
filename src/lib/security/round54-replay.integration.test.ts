/**
 * Disposable tenant PostgreSQL: two independent clients race on the same
 * external provider ID. The unique database constraints, not a pre-read,
 * determine idempotency. No live Twilio/inbound mail provider is required.
 */
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@/lib/db/generated/tenant";
const integration = process.env.RUN_CHESS_DB_INTEGRATION === "1" ? describe : describe.skip;
integration("Round 54 machine callback concurrency and database receipts", () => {
  let a: PrismaClient;
  let b: PrismaClient;
  const smsSid = "SM" + "4".repeat(32);
  const mailId = "<round54-idempotency@fictional.test>";
  let threadId = "";
  let mailAccountId = "";
  let mailThreadId = "";
  beforeAll(async () => {
    a = new PrismaClient();
    b = new PrismaClient();
    await Promise.all([a.$connect(), b.$connect()]);
    const smsThread = await a.smsThread.create({
      data: { ourNumberE164: "+15550005054", peerE164: "+15550006054" },
    });
    threadId = smsThread.id;
    const account = await a.emailAccount.create({
      data: { ownerClerkUserId: "fictional-round54", address: "round54@fictional.test" },
    });
    mailAccountId = account.id;
    const thread = await a.emailThread.create({
      data: { accountId: mailAccountId, subject: "Round 54 test" },
    });
    mailThreadId = thread.id;
  });
  afterAll(async () => {
    if (a) {
      await a.smsThread.deleteMany({ where: { id: threadId } });
      await a.emailAccount.deleteMany({ where: { id: mailAccountId } });
    }
    await Promise.all([a?.$disconnect(), b?.$disconnect()]);
  });
  it("writes exactly one INBOUND SMS provider SID across two connections", async () => {
    const input = {
      threadId, direction: "INBOUND" as const,
      fromE164: "+15550006054", toE164: "+15550005054",
      body: "fictional", providerMessageSid: smsSid, status: "DELIVERED" as const,
    };
    const outcomes = await Promise.allSettled([
      a.smsMessage.create({ data: input }), b.smsMessage.create({ data: input }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    const saved = await a.smsMessage.findMany({
      where: { direction: "INBOUND", providerMessageSid: smsSid },
    });
    expect(saved).toHaveLength(1);
  });
  it("writes exactly one INBOUND mail Message-ID per account", async () => {
    const input = {
      accountId: mailAccountId, threadId: mailThreadId,
      externalId: mailId, direction: "INBOUND" as const,
      fromAddress: "from@fictional.test", toAddresses: ["round54@fictional.test"],
    };
    const outcomes = await Promise.allSettled([
      a.emailMessage.create({ data: input }), b.emailMessage.create({ data: input }),
    ]);
    expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await a.emailMessage.count({ where: { accountId: mailAccountId,
      direction: "INBOUND", externalId: mailId } })).toBe(1);
  });
});
