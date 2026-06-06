/*
 * Broadcast send engine (Sprint 13, server-only). Two phases:
 *
 *  1. enqueueBroadcast - resolve the segment to recipients, drop anyone on the
 *     Unsubscribe list, and materialize BroadcastRecipient rows in PENDING. Sets
 *     the broadcast to SCHEDULED with scheduledAt (now or future).
 *  2. processBroadcast - called by /api/cron/broadcast-sender once scheduledAt
 *     passes. Marks SENDING, iterates PENDING recipients (EMAIL via the email
 *     lib, SMS via the telephony lib), updates each recipient status, then marks
 *     SENT and writes statsJson.
 *
 * Both take an explicit db (cron + public contexts have no tenant header).
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { sendEmail } from "@/lib/email/send";
import { sendAndRecordSms } from "@/lib/telephony/sms";
import { evaluateSegment, type SegmentEntity } from "./segments";

type Db = PrismaClient;

export type EnqueueResult = { ok: boolean; recipients: number; skippedUnsub: number; error?: string };

/** Resolve recipients, dedupe against Unsubscribe, create PENDING rows. */
export async function enqueueBroadcast(
  db: Db,
  broadcastId: string,
  scheduledAt: Date,
): Promise<EnqueueResult> {
  const broadcast = await db.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) return { ok: false, recipients: 0, skippedUnsub: 0, error: "Broadcast not found." };
  if (!broadcast.segmentId) return { ok: false, recipients: 0, skippedUnsub: 0, error: "Broadcast has no audience segment." };

  const segment = await db.segment.findUnique({ where: { id: broadcast.segmentId } });
  if (!segment) return { ok: false, recipients: 0, skippedUnsub: 0, error: "Segment not found." };

  const recipients = await evaluateSegment(db, {
    entityType: segment.entityType as SegmentEntity,
    filterJson: segment.filterJson,
  });

  const unsubRows = await db.unsubscribe.findMany({ select: { email: true } });
  const unsubbed = new Set(unsubRows.map((u) => u.email.toLowerCase()));

  // Replace any prior recipient set for a re-enqueue.
  await db.broadcastRecipient.deleteMany({ where: { broadcastId } });

  let skippedUnsub = 0;
  const data: {
    broadcastId: string;
    contactId: string | null;
    leadId: string | null;
    email: string | null;
    phone: string | null;
  }[] = [];
  const isEmail = broadcast.channel === "EMAIL";
  for (const r of recipients) {
    if (isEmail) {
      if (!r.email) continue;
      if (unsubbed.has(r.email.toLowerCase())) {
        skippedUnsub++;
        continue;
      }
    } else if (!r.phone) {
      continue;
    }
    data.push({
      broadcastId,
      contactId: r.entityType === "contact" ? r.id : null,
      leadId: r.entityType === "lead" ? r.id : null,
      email: r.email,
      phone: r.phone,
    });
  }

  if (data.length > 0) await db.broadcastRecipient.createMany({ data });
  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status: "SCHEDULED", scheduledAt },
  });

  return { ok: true, recipients: data.length, skippedUnsub };
}

export type ProcessResult = { sent: number; failed: number };

/**
 * Send all PENDING recipients for one broadcast, then finalize status + stats.
 * tenantSlug, when provided, is woven into the open/click tracking URLs so the
 * public tracking routes can resolve the tenant schema (schema-per-tenant means
 * a recipientId alone is not enough to find the tenant).
 */
export async function processBroadcast(db: Db, broadcastId: string, tenantSlug?: string): Promise<ProcessResult> {
  const broadcast = await db.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) return { sent: 0, failed: 0 };

  await db.broadcast.update({ where: { id: broadcastId }, data: { status: "SENDING" } });

  const pending = await db.broadcastRecipient.findMany({
    where: { broadcastId, status: "PENDING" },
  });

  let account: { id: string } | null = null;
  if (broadcast.channel === "EMAIL") {
    account = await db.emailAccount.findFirst({ where: { status: "ACTIVE" }, select: { id: true } });
  }
  let fromNumber = broadcast.fromNumber ?? null;
  if (broadcast.channel === "SMS" && !fromNumber) {
    const num = await db.phoneNumber.findFirst({ where: { status: "ACTIVE" }, select: { e164: true } });
    fromNumber = num?.e164 ?? null;
  }

  let sent = 0;
  let failed = 0;
  for (const rcpt of pending) {
    try {
      if (broadcast.channel === "EMAIL") {
        if (!account || !rcpt.email) {
          await markRecipient(db, rcpt.id, "FAILED", account ? "No recipient email" : "No active email account");
          failed++;
          continue;
        }
        const html = withTracking(broadcast.bodyHtml ?? "", rcpt.id, tenantSlug);
        const res = await sendEmail(
          { accountId: account.id, to: [rcpt.email], subject: broadcast.subject ?? broadcast.name, html, text: broadcast.bodyText ?? undefined },
          db,
        );
        if (res.ok) {
          await markRecipient(db, rcpt.id, "SENT");
          sent++;
        } else {
          await markRecipient(db, rcpt.id, "FAILED", res.error ?? "send failed");
          failed++;
        }
      } else {
        if (!fromNumber || !rcpt.phone) {
          await markRecipient(db, rcpt.id, "FAILED", fromNumber ? "No recipient phone" : "No active from-number");
          failed++;
          continue;
        }
        const res = await sendAndRecordSms(
          { fromE164: fromNumber, toE164: rcpt.phone, body: broadcast.bodyText ?? broadcast.name, contactId: rcpt.contactId, leadId: rcpt.leadId },
          db,
        );
        if (res.ok) {
          await markRecipient(db, rcpt.id, "SENT");
          sent++;
        } else {
          await markRecipient(db, rcpt.id, "FAILED", res.error ?? "send failed");
          failed++;
        }
      }
    } catch (err) {
      await markRecipient(db, rcpt.id, "FAILED", String(err instanceof Error ? err.message : err));
      failed++;
    }
  }

  const stats = await computeStats(db, broadcastId);
  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status: failed > 0 && sent === 0 ? "FAILED" : "SENT", sentAt: new Date(), statsJson: stats },
  });

  return { sent, failed };
}

async function markRecipient(
  db: Db,
  id: string,
  status: "SENT" | "FAILED",
  errorMessage?: string,
): Promise<void> {
  await db.broadcastRecipient.update({
    where: { id },
    data: { status, sentAt: status === "SENT" ? new Date() : null, errorMessage: errorMessage ?? null },
  });
}

/** Aggregate recipient statuses into the stats blob stored on the broadcast. */
type BroadcastStats = {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  failed: number;
};

export async function computeStats(db: Db, broadcastId: string): Promise<BroadcastStats> {
  const grouped = await db.broadcastRecipient.groupBy({
    by: ["status"],
    where: { broadcastId },
    _count: { _all: true },
  });
  const counts: BroadcastStats = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0, failed: 0 };
  for (const g of grouped) {
    const n = g._count._all;
    switch (g.status) {
      case "SENT":
        counts.sent += n;
        break;
      case "DELIVERED":
        counts.delivered += n;
        counts.sent += n;
        break;
      case "OPENED":
        counts.opened += n;
        counts.sent += n;
        break;
      case "CLICKED":
        counts.clicked += n;
        counts.opened += n;
        counts.sent += n;
        break;
      case "BOUNCED":
        counts.bounced += n;
        break;
      case "UNSUBSCRIBED":
        counts.unsubscribed += n;
        break;
      case "FAILED":
        counts.failed += n;
        break;
      default:
        break;
    }
  }
  return counts;
}

/** Append a 1x1 open-tracking pixel to an email body. Click tracking is wired
 * in the UI by pointing links at /api/track/click; we only inject the pixel.
 * The pixel carries `?t=<slug>` so the public open route can resolve the tenant
 * schema (a recipientId is only unique within a tenant). */
function withTracking(html: string, recipientId: string, tenantSlug?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const t = tenantSlug ? `?t=${encodeURIComponent(tenantSlug)}` : "";
  const pixel = `<img src="${base}/api/track/open/${recipientId}${t}" width="1" height="1" alt="" style="display:none" />`;
  return `${html}${pixel}`;
}
