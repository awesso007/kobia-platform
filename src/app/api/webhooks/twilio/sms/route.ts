/*
 * Inbound SMS webhook (Sprint 7). Twilio POSTs an incoming text here as
 * application/x-www-form-urlencoded. We resolve the SmsThread by
 * (ourNumber=To, peer=From), create it if new (auto-linking to a CRM record via
 * resolveLinkForPhone, falling back to a fresh Lead per the number's SMS routing
 * rule), insert an INBOUND SmsMessage, bump the unread counter, notify the
 * number's assigned user, and fire an SMS_RECEIVED automation event.
 *
 * Auth: validated by X-Twilio-Signature against TWILIO_AUTH_TOKEN. No
 * requirePermission - this is a public, signature-gated endpoint. Returns empty
 * TwiML so Twilio does not auto-reply.
 *
 * Tenant routing: the webhook URL carries ?tenant=<slug> (Twilio numbers are
 * provisioned with this query string). Defaults to "acme".
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { resolveLinkForPhone } from "@/lib/telephony/link";
import { validateSignature } from "@/lib/telephony/twilio";
import { dispatchAutomation } from "@/lib/automations/dispatch";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(body = EMPTY_TWIML) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("tenant") ?? DEFAULT_TENANT).toLowerCase();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  // Validate the Twilio signature against the exact request URL + params.
  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const body = params.Body ?? "";
  const messageSid = params.MessageSid || params.SmsSid || null;
  if (!from || !to) return twiml();

  const mediaCount = Number(params.NumMedia ?? "0") || 0;
  const mediaUrls: string[] = [];
  for (let i = 0; i < mediaCount; i++) {
    const u = params[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
  }

  const db = getTenantPrisma(schemaNameForSlug(slug));

  // Find the phone number row to know its routing rule + assigned user.
  const ourNumber = await db.phoneNumber.findUnique({ where: { e164: to } });

  // Existing thread for (ourNumber=To, peer=From)?
  let thread = await db.smsThread.findUnique({
    where: { ourNumberE164_peerE164: { ourNumberE164: to, peerE164: from } },
  });

  if (!thread) {
    const link = await resolveLinkForPhone(db, from);
    let contactId = link.contactId;
    let leadId = link.leadId;

    // Per the number's SMS routing rule: if set to create a Lead and nothing
    // matched, spin up a fresh Lead so the conversation has an owner.
    if (!contactId && !leadId && ourNumber) {
      const rule = await db.telephonyRule.findFirst({ where: { phoneNumberId: ourNumber.id, kind: "SMS" } });
      const cfg = (rule?.config ?? {}) as { onInbound?: string };
      if (cfg.onInbound === "createLead" || !rule) {
        const lead = await db.lead.create({
          data: {
            name: `SMS ${from}`,
            phone: from,
            source: "OTHER" as never,
            ...(ourNumber.assignedClerkUserId ? { ownerUserId: ourNumber.assignedClerkUserId } : {}),
          },
        });
        leadId = lead.id;
      }
    }

    thread = await db.smsThread.create({
      data: {
        ourNumberE164: to,
        peerE164: from,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        lastMessageAt: new Date(),
        messageCount: 0,
        unreadCount: 0,
      },
    });
  }

  const message = await db.smsMessage.create({
    data: {
      threadId: thread.id,
      direction: "INBOUND",
      fromE164: from,
      toE164: to,
      body,
      mediaUrls: mediaUrls as never,
      providerMessageSid: messageSid,
      status: "DELIVERED" as never,
    },
  });

  await db.smsThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date(), messageCount: { increment: 1 }, unreadCount: { increment: 1 } },
  });

  // Notify the number's assigned user (best-effort).
  if (ourNumber?.assignedClerkUserId) {
    const { notifyOn } = await import("@/lib/notifications/notify");
    await notifyOn(db, ourNumber.assignedClerkUserId, {
      type: "SYSTEM",
      title: `New SMS from ${from}`,
      body: body.slice(0, 160),
      linkUrl: "/app/messages",
    });
  }

  // Fire SMS_RECEIVED for whichever CRM record the thread links to.
  if (thread.contactId || thread.leadId) {
    await dispatchAutomation(
      {
        type: "SMS_RECEIVED",
        entityType: thread.contactId ? "CONTACT" : "LEAD",
        entityId: (thread.contactId ?? thread.leadId)!,
        payload: { messageId: message.id, threadId: thread.id, from, body },
      },
      db,
    );
  }

  return twiml();
}
