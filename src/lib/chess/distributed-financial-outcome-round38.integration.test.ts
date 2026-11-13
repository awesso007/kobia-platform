/**
 * Round 38, two physically separate disposable PostgreSQL databases.
 * Faults are injected around real persistence calls, never against a bank
 * provider or production tenant. We intentionally never auto-repeat a ledger
 * write with an UNKNOWN outcome. CI must supply both isolated URLs.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient as TenantDb } from "@/lib/db/generated/tenant";
import { PrismaClient as LegacyDb } from "@prisma/client";
import {
  reserveChessBankPostingAttempt, startChessBankPostingAttempt,
  markChessBankPostingAttemptUnknown, markChessBankPostingAttemptCommitted,
} from "./bank-financial-attempt";
import { guardAndCancelReservedFinancialAttempts } from "./financial-attempt-guard";
import { commitLegacyBankClassification } from "./bank-ledger-commit";
import { reconcileLegacyChessPosting } from "./bank-ledger-reconcile";

const integration = process.env.RUN_CHESS_DISTRIBUTED_DB_INTEGRATION === "1"
  ? describe : describe.skip;

integration("Round 38 distributed outcome faults on two separate Postgres databases", () => {
  let tenantDb: TenantDb;
  let ledgerDb: LegacyDb;

  beforeAll(async () => {
    const url = process.env.CHESS_FAULT_LEGACY_DATABASE_URL;
    if (!url || !process.env.DATABASE_URL || url === process.env.DATABASE_URL) {
      throw new Error("Distributed fault tests require distinct disposable database URLs.");
    }
    tenantDb = new TenantDb();
    ledgerDb = new LegacyDb({ datasources: { db: { url } } });
    await Promise.all([tenantDb.$connect(), ledgerDb.$connect()]);
    const tenantDatabase = new URL(process.env.DATABASE_URL).pathname;
    const ledgerDatabase = new URL(url).pathname;
    if (tenantDatabase === ledgerDatabase) {
      throw new Error("Fault test databases must have different database names.");
    }
  });

  afterAll(async () => {
    await Promise.all([tenantDb?.$disconnect(), ledgerDb?.$disconnect()]);
  });

  async function fixture(tag: string, amountCents = 18537n) {
    const suffix = randomUUID().replace(/-/g, "").slice(0, 16) + tag;
    const businessId = "round38-business-" + suffix;
    const actor = "round38-operator-" + suffix;
    const clientActor = "round38-client-" + suffix;
    // The DB trigger requires a PENDING record first, then a valid grant.
    const pendingConsent = await tenantDb.chessClientConsent.create({ data: {
      businessId, clientProfileId: "round38-client-profile-" + suffix,
      purpose: "service:BOOKKEEPING", policyVersion: "fictional-ci-v1",
      policyText: "Fictional isolated CI consent; no real bank activity.",
    } });
    const consent = await tenantDb.chessClientConsent.update({
      where: { id: pendingConsent.id },
      data: {
        status: "GRANTED", consentedAt: new Date(Date.now() - 10000),
        acceptedByClerkUserId: clientActor,
        verifiedEmailDigest: "a".repeat(64),
        acceptanceEvidenceDigest: "b".repeat(64),
      },
    });
    const company = await ledgerDb.tenant.create({
      data: { slug: "round38-" + suffix, name: "FICTIONAL isolated tenant" },
    });
    const entity = await ledgerDb.entity.create({data: {
      tenantId: company.id, name: "Fictional entity " + suffix,
      baseCurrency: "USD",
    }});
    const bankGl = await ledgerDb.account.create({data: {
      tenantId: company.id, entityId: entity.id,
      code: "1010", name: "Fake cash", type: "ASSET",
    }});
    const offset = await ledgerDb.account.create({data: {
      tenantId: company.id, entityId: entity.id,
      code: "4010", name: "Fake revenue", type: "REVENUE",
    }});
    const bankAccount = await ledgerDb.bankAccount.create({data: {
      tenantId: company.id, entityId: entity.id, glAccountId: bankGl.id,
      name: "FICTIONAL bank", accountType: "CHECKING", currency: "USD",
    }});
    const txn = await ledgerDb.bankTransaction.create({data: {
      tenantId: company.id, bankAccountId: bankAccount.id,
      postedDate: new Date("2026-10-19T00:00:00Z"), amountCents,
      dedupHash: "round38-" + suffix, description: "FICTIONAL, NO REAL MONEY",
    }});
    const reviewId = "round38-review-" + suffix;
    const sourceRefId = "chess-bank-review:" + reviewId;
    const reservation = {
      businessId, consentId: consent.id, reviewId,
      legacyTenantId: company.id, legacyEntityId: entity.id,
      legacyBankTransactionId: txn.id, sourceDigest: "c".repeat(64),
      sourceRefId, createdByClerkUserId: actor,
    };
    const posting = {
      tenantId: company.id, entityId: entity.id,
      bankTransactionId: txn.id, bankAccountId: bankAccount.id,
      dedupHash: txn.dedupHash, postedDate: txn.postedDate, amountCents,
      bankGlAccountId: bankGl.id, offsetAccountId: offset.id,
      sourceRefId, actorId: actor,
    };
    const read = () => reconcileLegacyChessPosting(ledgerDb, {
      tenantId: company.id, entityId: entity.id,
      bankTransactionId: txn.id, sourceRefId,
    });
    const receipts = async () => ({
      tenant: await tenantDb.chessFinancialAttempt.findUnique({ where: { sourceRefId } }),
      bank: await ledgerDb.bankTransaction.findUnique({ where: { id: txn.id } }),
      journals: await ledgerDb.journalEntry.findMany({
        where: { tenantId: company.id, entityId: entity.id, sourceRefId },
        include: { lines: true },
      }),
      cash: await ledgerDb.account.findUnique({ where: { id: bankGl.id } }),
      income: await ledgerDb.account.findUnique({ where: { id: offset.id } }),
    });
    return { consent, actor, clientActor, reservation, posting, txn, read, receipts,
      entity, bankGl, offset, businessId };
  }

  async function start(f: Awaited<ReturnType<typeof fixture>>) {
    const attempt = await reserveChessBankPostingAttempt(tenantDb, f.reservation);
    expect(attempt.status).toBe("RESERVED");
    expect(await startChessBankPostingAttempt(tenantDb, attempt.id, f.actor)).toBe(true);
    return attempt;
  }

  async function withdraw(f: Awaited<ReturnType<typeof fixture>>) {
    await tenantDb.$transaction(async tx => {
      await guardAndCancelReservedFinancialAttempts(
        tx, f.consent.id, new Date(), f.clientActor,
      );
      await tx.chessClientConsent.update({where: {id: f.consent.id},
        data: {status: "WITHDRAWN", withdrawnAt: new Date()}});
    }, {isolationLevel: "Serializable"});
  }

  it("lost commit ACK/timeout yields UNKNOWN, no repeat journal, then a verified receipt pins exactly once", async () => {
    const f = await fixture("ack");
    const attempt = await start(f);
    let actualJournal = "";
    // Simulated network ACK loss happens AFTER a real commit to the other DB.
    try {
      actualJournal = await commitLegacyBankClassification(ledgerDb, f.posting);
      throw new Error("SYNTHETIC_ETIMEDOUT_AFTER_LEGACY_COMMIT");
    } catch (error) {
      expect(String(error)).toContain("SYNTHETIC_ETIMEDOUT");
      await markChessBankPostingAttemptUnknown(tenantDb, attempt.id, f.actor);
    }
    const unresolved = await f.receipts();
    expect(unresolved.tenant?.status).toBe("UNKNOWN");
    expect(unresolved.tenant?.journalEntryId).toBeNull();
    expect(unresolved.journals).toHaveLength(1);
    expect(unresolved.bank?.categorizedJournalEntryId).toBe(actualJournal);
    expect(await startChessBankPostingAttempt(tenantDb, attempt.id, f.actor)).toBe(false);
    await expect(commitLegacyBankClassification(ledgerDb, f.posting)).rejects.toThrow();
    const checked = await f.read();
    expect(checked).toMatchObject({
      status:"MATCHED_POSTED", journalEntryId:actualJournal,
      bankSettled:false, requiresIndependentReview:false,
    });
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,checked.journalEntryId!)).toBe(true);
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,checked.journalEntryId!)).toBe(true);
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,"other-journal")).toBe(false);
    const done = await f.receipts();
    expect(done.tenant?.status).toBe("COMMITTED");
    expect(done.tenant?.journalEntryId).toBe(actualJournal);
    expect(done.journals).toHaveLength(1);
    expect(done.journals[0]?.lines).toHaveLength(2);
    expect(done.cash?.balanceCents).toBe(f.posting.amountCents);
    expect(done.income?.balanceCents).toBe(f.posting.amountCents);
    await withdraw(f);
    expect((await tenantDb.chessClientConsent.findUnique({
      where:{id:f.consent.id},
    }))?.status).toBe("WITHDRAWN");
  });

  it("timeout before legacy call never posts, cannot auto-retry UNKNOWN, and blocks consent withdrawal", async () => {
    const f=await fixture("before");
    const attempt=await start(f);
    // Inject timeout before opening the other database transaction.
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    expect(await f.read()).toMatchObject({
      status:"UNPOSTED",journalEntryId:null,bankSettled:false,
    });
    expect((await f.receipts()).journals).toHaveLength(0);
    expect(await reserveChessBankPostingAttempt(tenantDb,f.reservation))
      .toMatchObject({id:attempt.id,status:"UNKNOWN"});
    expect(await startChessBankPostingAttempt(tenantDb,attempt.id,f.actor)).toBe(false);
    await expect(withdraw(f)).rejects.toThrow();
    const after=await f.receipts();
    expect(after.tenant?.status).toBe("UNKNOWN");
    expect(after.bank?.status).toBe("UNMATCHED");
    expect(after.cash?.balanceCents).toBe(0n);
    expect(after.income?.balanceCents).toBe(0n);
  });

  it("partial ledger write failure rolls back bank claim, journals, lines and account balances", async () => {
    const f=await fixture("closed");
    await ledgerDb.accountingPeriod.create({data:{
      tenantId:f.posting.tenantId,entityId:f.posting.entityId,
      startDate:new Date("2026-10-01T00:00:00Z"),
      endDate:new Date("2026-10-31T00:00:00Z"),
      label:"Fictional closed period",status:"CLOSED",
    }});
    const attempt=await start(f);
    await expect(commitLegacyBankClassification(ledgerDb,f.posting)).rejects.toThrow();
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    const after=await f.receipts();
    expect(after.tenant?.status).toBe("UNKNOWN");
    expect(after.bank?.status).toBe("UNMATCHED");
    expect(after.bank?.categorizedJournalEntryId).toBeNull();
    expect(after.journals).toHaveLength(0);
    expect(after.cash?.balanceCents).toBe(0n);
    expect(after.income?.balanceCents).toBe(0n);
    expect(await f.read()).toMatchObject({status:"UNPOSTED",bankSettled:false});
    await expect(withdraw(f)).rejects.toThrow();
  });

  it("tenant receipt timeout after legacy success leaves safe unresolved state and one journal", async () => {
    const f=await fixture("receipt");
    const attempt=await start(f);
    const journalId=await commitLegacyBankClassification(ledgerDb,f.posting);
    // Inject tenant receipt store outage before the COMMITTED transition.
    expect((await f.receipts()).tenant?.status).toBe("EXECUTING");
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    await expect(withdraw(f)).rejects.toThrow();
    expect((await f.read()).journalEntryId).toBe(journalId);
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,journalId)).toBe(true);
    expect((await f.receipts()).journals).toHaveLength(1);
  });

  it("duplicate requests and a consent race never create a second reservation or journal", async () => {
    const f=await fixture("race");
    // SERIALIZABLE can reject one racing transaction with P2034. The
    // caller may retry reservation, but may not retry the ledger mutation.
    const races=await Promise.allSettled([
      reserveChessBankPostingAttempt(tenantDb,f.reservation),
      reserveChessBankPostingAttempt(tenantDb,f.reservation),
    ]);
    for(const result of races){
      if(result.status==="rejected"){
        expect((result.reason as {code?:string}).code).toBe("P2034");
      }
    }
    const a=await reserveChessBankPostingAttempt(tenantDb,f.reservation);
    expect(races.filter(x=>x.status==="fulfilled").length).toBeGreaterThan(0);
    for(const result of races){
      if(result.status==="fulfilled")expect(result.value.id).toBe(a.id);
    }
    const started=await Promise.allSettled([
      startChessBankPostingAttempt(tenantDb,a.id,f.actor),
      startChessBankPostingAttempt(tenantDb,a.id,f.actor),
    ]);
    expect(started.filter(x=>x.status==="fulfilled"&&x.value===true)).toHaveLength(1);
    for(const x of started){
      if(x.status==="rejected")expect((x.reason as {code?:string}).code).toBe("P2034");
    }
    await expect(withdraw(f)).rejects.toThrow();
    const journalId=await commitLegacyBankClassification(ledgerDb,f.posting);
    await markChessBankPostingAttemptCommitted(tenantDb,a.id,f.actor,journalId);
    expect((await f.receipts()).journals).toHaveLength(1);
    await expect(commitLegacyBankClassification(ledgerDb,f.posting)).rejects.toThrow();
  });

  it("consent withdrawn during RESERVED cancels attempt before any ledger write", async () => {
    const f=await fixture("consent");
    const attempt=await reserveChessBankPostingAttempt(tenantDb,f.reservation);
    await withdraw(f);
    expect(await startChessBankPostingAttempt(tenantDb,attempt.id,f.actor)).toBe(false);
    const after=await f.receipts();
    expect(after.tenant?.status).toBe("CANCELLED");
    expect(after.bank?.status).toBe("UNMATCHED");
    expect(after.journals).toHaveLength(0);
    await expect(reserveChessBankPostingAttempt(tenantDb,f.reservation)).rejects.toThrow();
  });
  // Round 44: test true Postgres state transitions across two disposable
  // DATABASES, not real provider payments or multi-cluster network failures.
  it("reservation acknowledgment timeout is safely repeatable without duplicate attempts or audit receipts",async()=>{
    const f=await fixture("reserve-ack");
    const first=await reserveChessBankPostingAttempt(tenantDb,f.reservation);
    expect(first.status).toBe("RESERVED");
    // The first tenant transaction committed but its HTTP acknowledgment was lost.
    await expect((async()=>{throw new Error("SYNTHETIC_RESERVATION_ACK_TIMEOUT");})())
      .rejects.toThrow("SYNTHETIC_RESERVATION_ACK_TIMEOUT");
    const retries=await Promise.all([
      reserveChessBankPostingAttempt(tenantDb,f.reservation),
      reserveChessBankPostingAttempt(tenantDb,f.reservation),
    ]);
    expect(retries.map(x=>x.id)).toEqual([first.id,first.id]);
    expect(await tenantDb.chessFinancialAttempt.count({
      where:{sourceRefId:f.reservation.sourceRefId},
    })).toBe(1);
    expect(await tenantDb.chessSecurityEvent.count({
      where:{resourceType:"ChessFinancialAttempt",resourceId:first.id,
        action:"BANK_POSTING_ATTEMPT_RESERVED"},
    })).toBe(1);
    expect((await f.receipts()).journals).toHaveLength(0);
    expect((await f.read()).status).toBe("UNPOSTED");
  },15000);

  it("simultaneous duplicate legacy commits post exactly one double-entry journal and never retry the ambiguous attempt",async()=>{
    const f=await fixture("dupe-commit");
    const attempt=await start(f);
    const results=await Promise.allSettled([
      commitLegacyBankClassification(ledgerDb,f.posting),
      commitLegacyBankClassification(ledgerDb,f.posting),
    ]);
    const posted=results.filter((x):x is PromiseFulfilledResult<string>=>x.status==="fulfilled");
    expect(posted).toHaveLength(1);
    expect(results.filter(x=>x.status==="rejected")).toHaveLength(1);
    const journalId=posted[0]!.value;
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    expect(await startChessBankPostingAttempt(tenantDb,attempt.id,f.actor)).toBe(false);
    await expect(commitLegacyBankClassification(ledgerDb,f.posting)).rejects.toThrow();
    const observed=await f.read();
    expect(observed).toMatchObject({
      status:"MATCHED_POSTED",journalEntryId:journalId,bankSettled:false,
    });
    const after=await f.receipts();
    expect(after.tenant?.status).toBe("UNKNOWN");
    expect(after.journals).toHaveLength(1);
    expect(after.journals[0]?.lines).toHaveLength(2);
    expect(after.cash?.balanceCents).toBe(f.posting.amountCents);
    expect(after.income?.balanceCents).toBe(f.posting.amountCents);
    await expect(withdraw(f)).rejects.toThrow();
  },15000);

  it("different retry fingerprint or source reference cannot hijack an existing financial reservation",async()=>{
    const f=await fixture("fingerprint");
    const attempt=await reserveChessBankPostingAttempt(tenantDb,f.reservation);
    await expect(reserveChessBankPostingAttempt(tenantDb,{
      ...f.reservation,sourceDigest:"d".repeat(64),
    })).rejects.toThrow();
    await expect(reserveChessBankPostingAttempt(tenantDb,{
      ...f.reservation,legacyBankTransactionId:"fictional-unrelated-bank-row",
    })).rejects.toThrow();
    await expect(reserveChessBankPostingAttempt(tenantDb,{
      ...f.reservation,sourceRefId:f.reservation.sourceRefId+"-different",
    })).rejects.toThrow();
    const after=await f.receipts();
    expect(after.tenant?.id).toBe(attempt.id);
    expect(after.tenant?.sourceDigest).toBe(f.reservation.sourceDigest);
    expect(await tenantDb.chessFinancialAttempt.count({
      where:{consentId:f.consent.id},
    })).toBe(1);
    expect(after.journals).toHaveLength(0);
    expect(after.bank?.status).toBe("UNMATCHED");
  },15000);

  it("partial failure after claiming a bank row for a missing GL offset rolls back all cross-entity ledger effects",async()=>{
    const f=await fixture("offset-failure");
    const attempt=await start(f);
    // The first UPDATE would claim UNMATCHED -> CATEGORIZED; subsequent
    // GL validation fails within that SAME legacy SERIALIZABLE transaction.
    await expect(commitLegacyBankClassification(ledgerDb,{
      ...f.posting,offsetAccountId:"fictional-no-matching-gl-account",
    })).rejects.toThrow();
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    const after=await f.receipts();
    expect(after.tenant?.status).toBe("UNKNOWN");
    expect(after.bank?.status).toBe("UNMATCHED");
    expect(after.bank?.categorizedJournalEntryId).toBeNull();
    expect(after.journals).toHaveLength(0);
    expect(after.cash?.balanceCents).toBe(0n);
    expect(after.income?.balanceCents).toBe(0n);
    expect(await f.read()).toMatchObject({status:"UNPOSTED",bankSettled:false});
    await expect(withdraw(f)).rejects.toThrow();
  },15000);

  it("inactive bank account found after source-row claim rejects and rolls back rather than leaving an orphan CATEGORIZED bank row",async()=>{
    const f=await fixture("inactive-bank");
    const attempt=await start(f);
    await ledgerDb.bankAccount.update({
      where:{id:f.posting.bankAccountId},data:{isActive:false},
    });
    await expect(commitLegacyBankClassification(ledgerDb,f.posting)).rejects.toThrow();
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    const after=await f.receipts();
    expect(after.bank?.status).toBe("UNMATCHED");
    expect(after.bank?.categorizedJournalEntryId).toBeNull();
    expect(after.journals).toHaveLength(0);
    expect(after.cash?.balanceCents).toBe(0n);
    expect(after.income?.balanceCents).toBe(0n);
    expect(after.tenant?.status).toBe("UNKNOWN");
  },15000);

  it("reconciliation read timeout after legacy success never retries the ledger write or releases unresolved consent",async()=>{
    const f=await fixture("reconcile-timeout");
    const attempt=await start(f);
    const journalId=await commitLegacyBankClassification(ledgerDb,f.posting);
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    let reads=0;
    const flakyRead=async()=>{
      reads++;
      if(reads===1)throw new Error("SYNTHETIC_LEDGER_READ_TIMEOUT");
      return f.read();
    };
    await expect(flakyRead()).rejects.toThrow("SYNTHETIC_LEDGER_READ_TIMEOUT");
    expect((await f.receipts()).tenant?.status).toBe("UNKNOWN");
    await expect(withdraw(f)).rejects.toThrow();
    const observed=await flakyRead();
    expect(observed).toMatchObject({status:"MATCHED_POSTED",
      journalEntryId:journalId,bankSettled:false});
    expect(reads).toBe(2);
    expect((await f.receipts()).journals).toHaveLength(1);
    expect((await f.receipts()).tenant?.status).toBe("UNKNOWN");
    expect(await startChessBankPostingAttempt(tenantDb,attempt.id,f.actor)).toBe(false);
    await expect(commitLegacyBankClassification(ledgerDb,f.posting)).rejects.toThrow();
  },15000);

  it("concurrent matching receipt confirmations are idempotent and create one durable COMMITTED event",async()=>{
    const f=await fixture("receipt-race");
    const attempt=await start(f);
    const journalId=await commitLegacyBankClassification(ledgerDb,f.posting);
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    const attempts=await Promise.allSettled([
      markChessBankPostingAttemptCommitted(tenantDb,attempt.id,f.actor,journalId),
      markChessBankPostingAttemptCommitted(tenantDb,attempt.id,f.actor,journalId),
    ]);
    for(const result of attempts){
      if(result.status==="rejected")
        expect((result.reason as {code?:string}).code).toBe("P2034");
      else expect(typeof result.value).toBe("boolean");
    }
    // A transaction serialization retry is safe ONLY for receipt pinning,
    // not for a second bank posting or an UNKNOWN ledger write.
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,journalId)).toBe(true);
    expect(await markChessBankPostingAttemptCommitted(
      tenantDb,attempt.id,f.actor,"fabricated-second-receipt")).toBe(false);
    const done=await f.receipts();
    expect(done.tenant?.status).toBe("COMMITTED");
    expect(done.tenant?.journalEntryId).toBe(journalId);
    expect(done.journals).toHaveLength(1);
    expect(await tenantDb.chessSecurityEvent.count({where:{
      resourceType:"ChessFinancialAttempt",resourceId:attempt.id,
      action:"BANK_POSTING_ATTEMPT_COMMITTED",
    }})).toBe(1);
  },15000);

  it("a different source reference cannot reclassify an already posted bank row or invent a receipt",async()=>{
    const f=await fixture("other-source");
    const attempt=await start(f);
    const journalId=await commitLegacyBankClassification(ledgerDb,f.posting);
    await markChessBankPostingAttemptUnknown(tenantDb,attempt.id,f.actor);
    const different={...f.posting,sourceRefId:f.posting.sourceRefId+"-other"};
    await expect(commitLegacyBankClassification(ledgerDb,different)).rejects.toThrow();
    const observation=await reconcileLegacyChessPosting(ledgerDb,{
      tenantId:f.posting.tenantId,entityId:f.posting.entityId,
      bankTransactionId:f.posting.bankTransactionId,
      sourceRefId:different.sourceRefId,
    });
    expect(observation).toMatchObject({status:"DIVERGED",
      journalEntryId:null,requiresIndependentReview:true,bankSettled:false});
    const after=await f.receipts();
    expect(after.journals).toHaveLength(1);
    expect(after.journals[0]?.id).toBe(journalId);
    expect(after.tenant?.status).toBe("UNKNOWN");
    expect(after.tenant?.journalEntryId).toBeNull();
    expect(after.bank?.categorizedJournalEntryId).toBe(journalId);
  },15000);

});
