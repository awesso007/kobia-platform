/*
 * Inbound email webhook (Sprint 6). An external mail relay (e.g. a forwarding
 * rule or a provider inbound-parse hook) POSTs parsed messages here as JSON.
 *
 * Auth: the request must carry header X-KOBIA-INBOUND-SECRET matching env
 * EMAIL_INBOUND_SECRET. If EMAIL_INBOUND_SECRET is unset we reject every
 * request (fail closed) so an unconfigured deployment never ingests mail.
 *
 * Tenant routing: the recipient address encodes the tenant slug as
 *   kobia+<slug>@inbound.kobia.ai
 * Anything that does not match falls back to the default tenant "acme".
 *
 * On receipt we resolve / create the EmailThread (by inReplyTo / references,
 * else a new thread auto-linked to a CRM record via resolveLinkForAddress),
 * insert an INBOUND EmailMessage, persist attachments to /tmp, bump the thread
 * counters, and fire an EMAIL_RECEIVED automation event.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { resolveLinkForAddress } from "@/lib/email/link";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { ingestObject } from "@/lib/storage";
import { attachFile } from "@/lib/files/files";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";

type InboundAttachment = { filename: string; mimeType: string; size?: number; contentBase64?: string };
type InboundBody = {
  to?: string;
  from?: string;
  subject?: string;
  html?: string;
  text?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: InboundAttachment[];
};

/** Extract the tenant slug from kobia+<slug>@inbound.kobia.ai (else default). */
function tenantSlugFromAddress(to: string): string {
  const m = to.match(/kobia\+([a-z0-9-]+)@/i);
  return m?.[1]?.toLowerCase() ?? DEFAULT_TENANT;
}

function snippetOf(html: string, text?: string): string {
  const raw = (text ?? html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return raw.slice(0, 160);
}

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_INBOUND_SECRET;
  if (!secret) {
    console.warn("[email/inbound] EMAIL_INBOUND_SECRET not set - rejecting inbound mail.");
    return NextResponse.json({ ok: false, error: "Inbound email is not configured." }, { status: 503 });
  }
  if (req.headers.get("x-kobia-inbound-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: InboundBody;
  try {
    body = (await req.json()) as InboundBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const to = (body.to ?? "").trim();
  const from = (body.from ?? "").trim();
  if (!from) return NextResponse.json({ ok: false, error: "Missing from address." }, { status: 400 });

  const slug = tenantSlugFromAddress(to);
  const db = getTenantPrisma(schemaNameForSlug(slug));

  // An inbound message lands on whichever account owns the recipient address.
  // We pick the first active account as the inbox owner (alpha: single mailbox).
  const account = await db.emailAccount.findFirst({ orderBy: { createdAt: "asc" } });
  if (!account) {
    return NextResponse.json({ ok: false, error: "No email account for tenant." }, { status: 404 });
  }

  // Thread resolution: try to match an existing message by the referenced ids.
  let threadId: string | null = null;
  const refIds = [body.inReplyTo, ...(body.references ?? "").split(/\s+/)].map((s) => (s ?? "").trim()).filter(Boolean);
  if (refIds.length > 0) {
    const prior = await db.emailMessage.findFirst({
      where: { externalId: { in: refIds } },
      orderBy: { createdAt: "desc" },
    });
    if (prior) threadId = prior.threadId;
  }

  let link = null as Awaited<ReturnType<typeof resolveLinkForAddress>>;
  if (!threadId) {
    link = await resolveLinkForAddress(db, from);
    const thread = await db.emailThread.create({
      data: {
        subject: body.subject ?? null,
        lastMessageAt: new Date(),
        participantsJson: { from, to: to ? [to] : [] } as never,
        recordType: (link?.recordType ?? null) as never,
        recordId: link?.recordId ?? null,
        accountId: account.id,
        messageCount: 0,
        unreadCount: 0,
      },
    });
    threadId = thread.id;
  }

  const message = await db.emailMessage.create({
    data: {
      threadId,
      accountId: account.id,
      externalId: body.messageId ?? null,
      direction: "INBOUND",
      fromAddress: from,
      toAddresses: (to ? [to] : []) as never,
      subject: body.subject ?? null,
      bodyHtml: body.html ?? null,
      bodyText: body.text ?? null,
      snippet: snippetOf(body.html ?? "", body.text),
      receivedAt: new Date(),
      status: "DELIVERED" as never,
      repliedTo: body.inReplyTo ?? null,
    },
  });

  // Resolve the CRM record this thread links to (for File attachment).
  const threadForLink = await db.emailThread.findUnique({ where: { id: threadId } });
  const linkedType = threadForLink?.recordType ?? null;
  const linkedId = threadForLink?.recordId ?? null;

  // Ingest each attachment into the File system (source=EMAIL, READY) and attach
  // it to the linked record. The EmailAttachment keeps its own storageKey plus
  // the new fileId pointer so existing email UIs keep working.
  if (body.attachments && body.attachments.length > 0) {
    for (const att of body.attachments) {
      try {
        const buf = att.contentBase64 ? Buffer.from(att.contentBase64, "base64") : Buffer.alloc(0);
        const stored = await ingestObject({
          tenantSlug: slug,
          fileName: att.filename,
          mimeType: att.mimeType,
          data: buf,
        });
        const file = await db.file.create({
          data: {
            name: att.filename,
            mimeType: att.mimeType,
            size: BigInt(att.size ?? buf.length),
            storageProvider: stored.provider as never,
            storageKey: stored.storageKey,
            storageBucket: stored.storageBucket,
            status: "READY",
            source: "EMAIL",
          },
        });
        await db.emailAttachment.create({
          data: {
            messageId: message.id,
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size ?? buf.length,
            storageKey: stored.storageKey,
            fileId: file.id,
          },
        });
        if (linkedType && linkedId) {
          await attachFile(db, { fileId: file.id, entityType: linkedType as never, entityId: linkedId });
        }
      } catch (err) {
        console.error("[email/inbound] attachment ingest failed", err);
      }
    }
  }

  await db.emailThread.update({
    where: { id: threadId },
    data: {
      lastMessageAt: new Date(),
      messageCount: { increment: 1 },
      unreadCount: { increment: 1 },
    },
  });

  // Fire EMAIL_RECEIVED automation if the thread is linked to a record.
  if (linkedType && linkedId) {
    await dispatchAutomation(
      {
        type: "EMAIL_RECEIVED",
        entityType: linkedType as never,
        entityId: linkedId,
        payload: { messageId: message.id, threadId, from, subject: body.subject ?? "" },
      },
      db,
    );
  }

  return NextResponse.json({ ok: true, tenant: slug, threadId, messageId: message.id });
}
