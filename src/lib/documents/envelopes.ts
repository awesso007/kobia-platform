/*
 * E-sign envelope logic (Sprint 14). An Envelope wraps a single Document and a
 * list of EnvelopeSigners; sending emails each signer a tokenized link to the
 * public signing page (/sign/[token]); each signer submits a signature, which
 * advances their EnvelopeSignerStatus and, once every signer has SIGNED, rolls
 * the envelope up to COMPLETED. Every state change writes an EnvelopeAuditEvent
 * so the detail page can show a tamper-evident trail.
 *
 * Every function takes an explicit db so it works inside a request scope
 * (getTenantDb) and outside one (getTenantPrisma by slug, used by the public
 * signing route, the SEND_FOR_SIGNATURE automation, and the reminder cron).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { randomSlug } from "@/lib/files/files";
import { sendEmail } from "@/lib/email/send";

type Db = PrismaClient;

export type SignerInput = {
  name: string;
  email: string;
  order?: number;
  fields?: unknown;
};

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

async function logAudit(
  db: Db,
  envelopeId: string,
  event: "CREATED" | "SENT" | "VIEWED" | "SIGNED" | "DECLINED" | "VOIDED" | "COMPLETED",
  opts: { signerId?: string | null; ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await db.envelopeAuditEvent.create({
    data: {
      envelopeId,
      signerId: opts.signerId ?? null,
      event: event as never,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    },
  });
}

/**
 * Create a DRAFT envelope for a document with its signers. Each signer gets a
 * unique token now (used later when the envelope is sent). Logs a CREATED
 * audit event. Returns the new envelope id.
 */
export async function createEnvelope(
  db: Db,
  input: { name: string; documentId: string; message?: string | null; signers: SignerInput[]; createdById?: string | null },
): Promise<string> {
  const env = await db.envelope.create({
    data: {
      name: input.name,
      documentId: input.documentId,
      message: input.message ?? null,
      status: "DRAFT" as never,
      createdById: input.createdById ?? null,
      signers: {
        create: input.signers.map((s, i) => ({
          name: s.name,
          email: s.email,
          order: s.order ?? i,
          token: randomSlug(20),
          fields: (s.fields ?? []) as never,
          status: "PENDING" as never,
        })),
      },
    },
  });
  await logAudit(db, env.id, "CREATED", { signerId: input.createdById ?? null });
  return env.id;
}

/**
 * Build the public signing link for a signer. The public page lives at
 * /esign/[token] and resolves the tenant from a `?t=<slug>` query param (the
 * /sign path is taken by the accounting product). When the tenant slug is not
 * known to the caller the link omits ?t= and the page falls back to its
 * unavailable state, so callers should pass it whenever possible.
 */
function signingLink(token: string, tenantSlug?: string | null): string {
  const base = `${appUrl()}/esign/${token}`;
  return tenantSlug ? `${base}?t=${encodeURIComponent(tenantSlug)}` : base;
}

/** Email a single signer their tokenized signing link. Returns ok/skipped. */
async function emailSigner(
  db: Db,
  envelope: { id: string; name: string; message: string | null },
  signer: { id: string; name: string; email: string; token: string },
  tenantSlug?: string | null,
): Promise<boolean> {
  const account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" as never } });
  if (!account) return false;
  const link = signingLink(signer.token, tenantSlug);
  const intro = envelope.message ? `<p>${envelope.message}</p>` : "";
  const html =
    `<p>Hello ${signer.name},</p>` +
    `<p>You have a document to sign: <strong>${envelope.name}</strong>.</p>` +
    intro +
    `<p><a href="${link}">Review and sign</a></p>` +
    `<p>${link}</p>`;
  const res = await sendEmail(
    { accountId: account.id, to: [signer.email], subject: `Signature requested: ${envelope.name}`, html },
    db,
  );
  return res.ok;
}

/**
 * Send a DRAFT envelope: mark it SENT, email the first pending signer (lowest
 * order), mark that signer SENT, and log audit events. Signing is sequential -
 * only the current signer can sign; the next is emailed when they finish.
 */
export async function sendEnvelope(
  db: Db,
  envelopeId: string,
  tenantSlug?: string | null,
): Promise<{ ok: boolean; detail: string }> {
  const env = await db.envelope.findUnique({
    where: { id: envelopeId },
    include: { signers: { orderBy: { order: "asc" } } },
  });
  if (!env) return { ok: false, detail: "envelope not found" };
  if (env.status !== "DRAFT") return { ok: false, detail: `cannot send from ${env.status}` };
  if (env.signers.length === 0) return { ok: false, detail: "no signers" };

  await db.envelope.update({ where: { id: env.id }, data: { status: "SENT" as never, sentAt: new Date() } });
  await logAudit(db, env.id, "SENT");

  const first = env.signers[0]!;
  const sent = await emailSigner(db, env, first, tenantSlug);
  await db.envelopeSigner.update({
    where: { id: first.id },
    data: { status: "SENT" as never, reminderSentAt: new Date() },
  });
  await logAudit(db, env.id, "SENT", { signerId: first.id });
  return { ok: true, detail: sent ? `sent to ${first.email}` : "marked SENT (no email account)" };
}

/**
 * Record a signature for one signer (by token). Marks them SIGNED, advances to
 * the next pending signer (emails them), and when every signer has SIGNED rolls
 * the envelope up to COMPLETED. Public path - takes ip/userAgent for the audit.
 */
export async function signByToken(
  db: Db,
  token: string,
  input: {
    signatureData?: string | null;
    fields?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
    tenantSlug?: string | null;
  },
): Promise<{ ok: boolean; detail: string; completed?: boolean }> {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token) ||
      typeof input.signatureData !== "string" || input.signatureData.length < 1 ||
      input.signatureData.length > 120)
    return { ok: false, detail: "invalid signer proof" };

  const outcome = await db.$transaction(async tx => {
    const signer = await tx.envelopeSigner.findUnique({ where: { token } });
    if (!signer || !["SENT", "VIEWED"].includes(signer.status))
      return { ok: false as const, detail: "signer unavailable" };
    const env = await tx.envelope.findUnique({
      where: { id: signer.envelopeId },
      include: { signers: { orderBy: { order: "asc" } } },
    });
    if (!env || env.status !== "SENT") return { ok: false as const, detail: "envelope unavailable" };
    // Later signers must not sign before the preceding signer completes.
    const firstOpen = env.signers.find(s => s.status !== "SIGNED");
    if (!firstOpen || firstOpen.id !== signer.id)
      return { ok: false as const, detail: "signer unavailable" };

    const signed = await tx.envelopeSigner.updateMany({
      where: { id: signer.id, status: { in: ["SENT", "VIEWED"] } },
      data: {
        status: "SIGNED", signedAt: new Date(), signatureData: input.signatureData,
        ...(input.fields !== undefined ? { fields: input.fields as never } : {}),
      },
    });
    if (signed.count !== 1) throw new Error("Signature state changed");
    await tx.envelopeAuditEvent.create({
      data: {
        envelopeId: env.id, signerId: signer.id, event: "SIGNED",
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });

    const next = env.signers.find(s => s.id !== signer.id && s.status !== "SIGNED");
    if (!next) {
      const result = await tx.envelope.updateMany({
        where: { id: env.id, status: "SENT" },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      if (result.count !== 1) throw new Error("Envelope status changed");
      await tx.envelopeAuditEvent.create({
        data: { envelopeId: env.id, event: "COMPLETED" },
      });
      return { ok: true as const, completed: true as const, next: null,
        envelope: { id: env.id, name: env.name, message: env.message } };
    }
    // Claim the next signer during the same transaction; never email a
    // different signer based on a pre-commit snapshot.
    if (next.status !== "PENDING") throw new Error("Invalid signer order");
    const advanced = await tx.envelopeSigner.updateMany({
      where: { id: next.id, status: "PENDING" },
      data: { status: "SENT", reminderSentAt: new Date() },
    });
    if (advanced.count !== 1) throw new Error("Next signer state changed");
    await tx.envelopeAuditEvent.create({
      data: { envelopeId: env.id, signerId: next.id, event: "SENT" },
    });
    return { ok: true as const, completed: false as const,
      next: { id: next.id, name: next.name, email: next.email, token: next.token },
      envelope: { id: env.id, name: env.name, message: env.message } };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });

  if (!outcome.ok) return { ok: false, detail: outcome.detail };
  // External email is NOT part of a DB commit. A failed email may require
  // reminder retry / operator reconciliation, never a duplicate signature.
  if (outcome.next) {
    await emailSigner(db, outcome.envelope, outcome.next, input.tenantSlug)
      .catch(() => false);
  }
  return { ok: true, detail: "signature accepted", completed: outcome.completed };
}

/** Mark a signer as having viewed the signing page (audit only). */
export async function markViewed(
  db: Db,
  token: string,
  opts: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const signer = await db.envelopeSigner.findUnique({ where: { token } });
  if (!signer) return;
  if (signer.status === "SENT") {
    await db.envelopeSigner.update({ where: { id: signer.id }, data: { status: "VIEWED" as never } });
  }
  await logAudit(db, signer.envelopeId, "VIEWED", {
    signerId: signer.id,
    ipAddress: opts.ipAddress,
    userAgent: opts.userAgent,
  });
}

/**
 * Send reminder emails for SENT envelopes whose current signer has not signed
 * and was last emailed more than `olderThanMs` ago (default 24h). Sequential
 * signing means only one signer is active per envelope at a time (the lowest
 * order signer who is SENT or VIEWED), so we remind exactly that signer, reset
 * their reminderSentAt, and log a SENT audit event. Returns how many reminders
 * went out. Used by the daily envelope-reminder cron; takes an explicit slug so
 * the signing link carries the right `?t=`.
 */
export async function remindEnvelopes(
  db: Db,
  tenantSlug: string,
  olderThanMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const open = await db.envelope.findMany({
    where: { status: "SENT" as never },
    include: { signers: { orderBy: { order: "asc" } } },
    take: 500,
  });

  let reminded = 0;
  for (const env of open) {
    const current = env.signers.find((s) => s.status === "SENT" || s.status === "VIEWED");
    if (!current) continue;
    if (current.reminderSentAt && current.reminderSentAt > cutoff) continue;

    const sent = await emailSigner(db, env, current, tenantSlug);
    await db.envelopeSigner.update({ where: { id: current.id }, data: { reminderSentAt: new Date() } });
    await logAudit(db, env.id, "SENT", { signerId: current.id });
    if (sent) reminded++;
  }
  return reminded;
}

/** Void an envelope (no further signing). Logs a VOIDED audit event. */
export async function voidEnvelope(db: Db, envelopeId: string): Promise<{ ok: boolean; detail: string }> {
  const env = await db.envelope.findUnique({ where: { id: envelopeId } });
  if (!env) return { ok: false, detail: "envelope not found" };
  if (env.status === "COMPLETED") return { ok: false, detail: "already completed" };
  if (env.status === "VOIDED") return { ok: false, detail: "already voided" };
  await db.envelope.update({ where: { id: env.id }, data: { status: "VOIDED" as never, voidedAt: new Date() } });
  await logAudit(db, env.id, "VOIDED");
  return { ok: true, detail: "voided" };
}
