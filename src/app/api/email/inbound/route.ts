/**
 * Inbound mail is a privileged relay callback. Exact server-side relay secret,
 * ACTIVE tenant and addressed ACTIVE mailbox must all match before mutation.
 *
 * Message-ID is required for replay-safe receipt; a unique account/direction
 * index atomically deduplicates concurrent retries. Attachments are DISABLED
 * until a private, malware-scanned, quarantined intake path is accepted.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { resolveLinkForAddress } from "@/lib/email/link";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import { getPlatformDb } from "@/lib/db/platform";
import {
  inboundMailCredentialDecision, inboundMailTenantSlug,
} from "@/lib/security/legacy-inbound-mail";
import { readPublicFormBody, PublicFormGateError } from "@/lib/security/public-form-abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
type InboundBody = {
  to?: unknown; from?: unknown; subject?: unknown; html?: unknown;
  text?: unknown; messageId?: unknown; inReplyTo?: unknown;
  references?: unknown; attachments?: unknown;
};
function bounded(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length <= max &&
    !/[\u0000]/.test(value) ? value : null;
}
function snippet(html: string, plain: string): string {
  return (plain || html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function POST(req: NextRequest) {
  const auth = inboundMailCredentialDecision(
    req.headers.get("x-kobia-inbound-secret"), process.env.EMAIL_INBOUND_SECRET,
  );
  if (auth === "UNCONFIGURED")
    return NextResponse.json({ ok: false, error: "Inbound email is not configured." },
      { status: 503, headers });
  if (auth !== "AUTHORIZED")
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401, headers });

  let body: InboundBody;
  try {
    if (!(req.headers.get("content-type") ?? "").startsWith("application/json"))
      throw Error("content-type");
    const raw: unknown = JSON.parse(new TextDecoder().decode(await readPublicFormBody(req, 65536)));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("body");
    body = raw as InboundBody;
  } catch (error) {
    return NextResponse.json({ ok: false,
      error: error instanceof PublicFormGateError ? error.safeMessage : "Invalid inbound payload." },
      { status: 400, headers });
  }
  // Do not silently ingest unscreened bytes into a READY client file.
  // The provider may retry after the sender uses an attachment-free request.
  if (body.attachments !== undefined &&
      (!Array.isArray(body.attachments) || body.attachments.length > 0))
    return NextResponse.json({ ok: false, error: "Inbound attachments require reviewed scanning." },
      { status: 422, headers });

  const to = bounded(body.to, 320)?.trim().toLowerCase() ?? "";
  const from = bounded(body.from, 320)?.trim() ?? "";
  const subject = body.subject === undefined ? null : bounded(body.subject, 300);
  const html = body.html === undefined ? null : bounded(body.html, 24000);
  const plain = body.text === undefined ? null : bounded(body.text, 24000);
  const messageId = bounded(body.messageId, 320)?.trim() ?? "";
  const replyTo = body.inReplyTo === undefined ? null : bounded(body.inReplyTo, 320);
  const references = body.references === undefined ? "" : bounded(body.references, 4000);
  if (!from || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(from) ||
      !/^[^\r\n]{8,320}$/.test(messageId) || !messageId.includes("@") ||
      subject === null && body.subject !== undefined ||
      html === null && body.html !== undefined ||
      plain === null && body.text !== undefined ||
      references === null || replyTo === null && body.inReplyTo !== undefined)
    return NextResponse.json({ ok: false, error: "Invalid inbound message." }, { status: 400, headers });

  const slug = inboundMailTenantSlug(to, process.env.EMAIL_INBOUND_DOMAIN);
  if (!slug) return NextResponse.json({ ok: false, error: "Invalid inbound recipient." }, { status: 400, headers });
  try {
    const tenant = await getPlatformDb().tenantRegistry.findUnique({
      where: { slug }, select: { status: true, schemaName: true },
    });
    if (tenant?.status !== "ACTIVE" || tenant.schemaName !== schemaNameForSlug(slug))
      return NextResponse.json({ ok: false, error: "Recipient unavailable." }, { status: 404, headers });
    const db = getTenantPrisma(tenant.schemaName);
    const account = await db.emailAccount.findFirst({
      where: { address: { equals: to, mode: "insensitive" }, status: "ACTIVE" },
      select: { id: true },
    });
    if (!account) return NextResponse.json({ ok: false, error: "Recipient unavailable." }, { status: 404, headers });
    const replayWhere = { accountId: account.id, direction: "INBOUND" as const, externalId: messageId };
    const duplicate = await db.emailMessage.findFirst({
      where: replayWhere, select: { id: true },
    });
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true }, { headers });
    const refIds = [replyTo, ...(references ?? "").split(/\s+/)]
      .filter((x): x is string => !!x && x.length <= 320).slice(0, 16);
    const link = await resolveLinkForAddress(db, from);
    const accepted = await db.$transaction(async tx => {
      const old = refIds.length ? await tx.emailMessage.findFirst({
        where: { accountId: account.id, externalId: { in: refIds } },
        orderBy: { createdAt: "desc" }, select: { threadId: true },
      }) : null;
      const thread = old ? await tx.emailThread.findFirst({
        where: { id: old.threadId, accountId: account.id }, select: { id: true },
      }) : null;
      const threadId = thread?.id ?? (await tx.emailThread.create({
        data: {
          subject, accountId: account.id, lastMessageAt: new Date(),
          participantsJson: { from, to: [to] } as never,
          recordType: (link?.recordType ?? null) as never,
          recordId: link?.recordId ?? null,
          messageCount: 0, unreadCount: 0,
        }, select: { id: true },
      })).id;
      const message = await tx.emailMessage.create({
        data: {
          threadId, accountId: account.id, externalId: messageId,
          direction: "INBOUND", fromAddress: from,
          toAddresses: [to] as never, subject, bodyHtml: html, bodyText: plain,
          snippet: snippet(html ?? "", plain ?? ""),
          receivedAt: new Date(), status: "DELIVERED", repliedTo: replyTo,
        }, select: { id: true },
      });
      await tx.emailThread.update({
        where: { id: threadId },
        data: {
          lastMessageAt: new Date(),
          messageCount: { increment: 1 }, unreadCount: { increment: 1 },
        },
      });
      return { threadId, messageId: message.id };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
    // Never re-trigger message side effects before the committed receipt.
    await reindex(db, "EMAIL_MESSAGE", accepted.messageId).catch(() => undefined);
    if (link?.recordType && link.recordId) {
      await dispatchAutomation({
        type: "EMAIL_RECEIVED",
        entityType: link.recordType as never,
        entityId: link.recordId,
        payload: { messageId: accepted.messageId, threadId: accepted.threadId,
          from, subject: subject ?? "" },
      }, db).catch(() => undefined);
    }
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      // A transaction abort may be acknowledged only after its exact receipt
      // is observed. Otherwise fail closed and let the relay retry.
      try {
        const row = await getPlatformDb().tenantRegistry.findUnique({
          where: { slug }, select: { status: true, schemaName: true },
        });
        if (row?.status === "ACTIVE" && row.schemaName === schemaNameForSlug(slug)) {
          const db = getTenantPrisma(row.schemaName);
          const account = await db.emailAccount.findFirst({
            where: { address: { equals: to, mode: "insensitive" }, status: "ACTIVE" },
            select: { id: true },
          });
          if (account && await db.emailMessage.findFirst({
            where: { accountId: account.id, direction: "INBOUND", externalId: messageId },
            select: { id: true },
          })) return NextResponse.json({ ok: true, duplicate: true }, { headers });
        }
      } catch { /* Acknowledge only observable committed receipts. */ }
    }
    return NextResponse.json({ ok: false, error: "Inbound email unavailable." }, { status: 503, headers });
  }
}
