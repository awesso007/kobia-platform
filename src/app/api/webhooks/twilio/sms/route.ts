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
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { requireSingleLegacyMachineBusiness } from "@/lib/security/legacy-machine-business-round55";
import { validatedWebhookTenantSlug, activeWebhookTenantSchema, readBoundedTwilioParams, twilioAccountMatches } from "@/lib/security/legacy-webhook-tenant";
import { resolveLinkForPhone } from "@/lib/telephony/link";
import { validateSignature } from "@/lib/telephony/twilio";
import { dispatchAutomation } from "@/lib/automations/dispatch";

export const dynamic = "force-dynamic";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(body = EMPTY_TWIML) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const slug = validatedWebhookTenantSlug(req.nextUrl.searchParams.get("tenant"));
  if (!slug) return NextResponse.json({ ok: false, error: "Missing or invalid tenant." }, { status: 400 });

  let params: Record<string, string>;
  try { params = await readBoundedTwilioParams(req); }
  catch {
    return NextResponse.json({ ok: false, error: "Invalid callback payload." }, { status: 400 });
  }

  // Validate the Twilio signature against the exact request URL + params.
  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok || !twilioAccountMatches(params.AccountSid)) return NextResponse.json({ ok: false, error: "Invalid signature or account." }, { status: 401 });

  // Require an ACTIVE platform registry entry bound to the signed URL selector.
  const schema = await activeWebhookTenantSchema(slug);
  if (!schema) return NextResponse.json({ ok: false, error: "Recipient unavailable." }, { status: 404 });

  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const body = params.Body ?? "";
  const sid = params.MessageSid || params.SmsSid || "";
  const count = Number(params.NumMedia ?? "0");
  if (!/^\+[1-9][0-9]{7,14}$/.test(from) || !/^\+[1-9][0-9]{7,14}$/.test(to) ||
      !/^(SM|MM)[0-9a-fA-F]{32}$/.test(sid) ||
      body.length > 1600 || !Number.isSafeInteger(count) || count < 0 || count > 10) {
    return NextResponse.json({ ok: false, error: "Invalid SMS callback." }, { status: 400 });
  }
  const mediaUrls: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = params["MediaUrl" + i];
    if (!raw || raw.length > 2048)
      return NextResponse.json({ ok: false, error: "Invalid media." }, { status: 400 });
    try {
      const uri = new URL(raw);
      if (uri.protocol !== "https:" || uri.hostname !== "api.twilio.com" ||
          uri.username || uri.password) throw Error("media host");
      mediaUrls.push(uri.toString());
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid media." }, { status: 400 });
    }
  }
  const db = getTenantPrisma(schema);
  try { await requireSingleLegacyMachineBusiness(db); }
  catch {
    return NextResponse.json({ ok: false, error: "Callback unavailable." }, { status: 503 });
  }
  // The signed account must own an ACTIVE Twilio number in THIS tenant.
  const ourNumber = await db.phoneNumber.findUnique({ where: { e164: to } });
  if (!ourNumber || ourNumber.status !== "ACTIVE" || ourNumber.provider !== "TWILIO")
    return NextResponse.json({ ok: false, error: "Recipient unavailable." }, { status: 404 });

  // Fast path only. DB uniqueness is the authoritative concurrent replay guard.
  const replay = await db.smsMessage.findFirst({
    where: { direction: "INBOUND", providerMessageSid: sid }, select: { id: true },
  });
  if (replay) return twiml();

  const link = await resolveLinkForPhone(db, from);
  const rule = await db.telephonyRule.findFirst({
    where: { phoneNumberId: ourNumber.id, kind: "SMS" },
  });
  const config = (rule?.config ?? {}) as { onInbound?: string };
  let created: {
    thread: { id: string; contactId: string | null; leadId: string | null };
    message: { id: string };
  };
  try {
    created = await db.$transaction(async tx => {
      await requireSingleLegacyMachineBusiness(tx);
      const oldThread = await tx.smsThread.findUnique({
        where: { ourNumberE164_peerE164: { ourNumberE164: to, peerE164: from } },
      });
      let contactId = oldThread?.contactId ?? link.contactId ?? null;
      let leadId = oldThread?.leadId ?? link.leadId ?? null;
      if (!oldThread && !contactId && !leadId &&
          (config.onInbound === "createLead" || !rule)) {
        const lead = await tx.lead.create({
          data: {
            name: "SMS " + from, phone: from, source: "OTHER",
            ...(ourNumber.assignedClerkUserId
              ? { ownerUserId: ourNumber.assignedClerkUserId } : {}),
          },
        });
        leadId = lead.id;
      }
      const thread = await tx.smsThread.upsert({
        where: { ourNumberE164_peerE164: { ourNumberE164: to, peerE164: from } },
        update: {},
        create: {
          ourNumberE164: to, peerE164: from, contactId, leadId,
          lastMessageAt: new Date(), messageCount: 0, unreadCount: 0,
        },
      });
      const message = await tx.smsMessage.create({
        data: {
          threadId: thread.id, direction: "INBOUND",
          fromE164: from, toE164: to, body, mediaUrls: mediaUrls as never,
          providerMessageSid: sid, status: "DELIVERED",
        },
      });
      await tx.smsThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: new Date(),
          messageCount: { increment: 1 }, unreadCount: { increment: 1 },
        },
      });
      return { thread, message };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 15000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      // Only acknowledge a duplicate if this exact SID was committed.
      const prior = await db.smsMessage.findFirst({
        where: { direction: "INBOUND", providerMessageSid: sid }, select: { id: true },
      });
      if (prior) return twiml();
    }
    return NextResponse.json({ ok: false, error: "Inbound SMS unavailable." }, { status: 503 });
  }
  const { thread, message } = created;

  // Notify the number's assigned user (best-effort).
  if (ourNumber?.assignedClerkUserId) {
    const { notifyOn } = await import("@/lib/notifications/notify");
    await notifyOn(db, ourNumber.assignedClerkUserId, {
      type: "SYSTEM",
      title: `New SMS from ${from}`,
      body: body.slice(0, 160),
      linkUrl: "/app/messages",
    }).catch(() => undefined);
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
    ).catch(() => undefined);
  }

  return twiml();
}
