/*
 * Inbound voice webhook (Sprint 7). Twilio POSTs here when one of our numbers is
 * called (and also for the outbound-call leg, where From is one of our numbers).
 * We look up the called number's VOICE routing rule and return TwiML:
 *   - ring       -> <Dial> the assigned user's forwarding number (or the number)
 *   - voicemail  -> <Say> greeting + <Record>
 *   - ivr        -> <Say> menu greeting then <Record> (simple stub)
 * A Call row is created/updated so status + recording webhooks can finish it.
 *
 * Auth: validated by X-Twilio-Signature. No requirePermission - public endpoint.
 * Tenant via ?tenant=<slug> (default "acme").
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { requireSingleLegacyMachineBusiness } from "@/lib/security/legacy-machine-business-round55";
import { validatedWebhookTenantSlug, activeWebhookTenantSchema, readBoundedTwilioParams, twilioAccountMatches } from "@/lib/security/legacy-webhook-tenant";
import { resolveLinkForPhone } from "@/lib/telephony/link";
import { validateSignature, generateTwiML } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";


function xml(body: string) {
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

  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok || !twilioAccountMatches(params.AccountSid)) return NextResponse.json({ ok: false, error: "Invalid signature or account." }, { status: 401 });

  // Require an ACTIVE platform registry entry bound to the signed URL selector.
  const schema = await activeWebhookTenantSchema(slug);
  if (!schema) return NextResponse.json({ ok: false, error: "Recipient unavailable." }, { status: 404 });

  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const callSid = params.CallSid || null;
  const direction = params.Direction?.startsWith("outbound") ? "OUTBOUND" : "INBOUND";

  const db = getTenantPrisma(schema);
  try { await requireSingleLegacyMachineBusiness(db); }
  catch {
    return NextResponse.json({ ok: false, error: "Callback unavailable." }, { status: 503 });
  }

  // The "our" number is To for inbound, From for outbound-dial legs.
  const ourE164 = direction === "OUTBOUND" ? from : to;
  const peerE164 = direction === "OUTBOUND" ? to : from;
  const ourNumber = await db.phoneNumber.findUnique({ where: { e164: ourE164 } });
  if (!ourNumber || ourNumber.status !== "ACTIVE" || ourNumber.provider !== "TWILIO")
    return NextResponse.json({ ok: false, error: "Number unavailable." }, { status: 404 });

  // Upsert a Call row keyed by provider SID (idempotent on retries).
  if (callSid) {
    const existing = await db.call.findFirst({ where: { providerCallSid: callSid } });
    if (!existing) {
      const link = await resolveLinkForPhone(db, peerE164);
      await db.call.create({
        data: {
          direction: direction as never,
          fromE164: from,
          toE164: to,
          providerCallSid: callSid,
          status: "RINGING",
          startedAt: new Date(),
          ownerClerkUserId: ourNumber?.assignedClerkUserId ?? null,
          contactId: link.contactId,
          leadId: link.leadId,
          dealId: link.dealId,
          companyId: link.companyId,
        },
      });
    }
  }

  // Outbound-dial legs: bridge straight to the dialed party.
  if (direction === "OUTBOUND") {
    return xml(generateTwiML({ dialNumber: peerE164, callerId: ourE164, recordingEnabled: true, tenantSlug: slug }));
  }

  // Inbound: consult the VOICE routing rule.
  const rule = ourNumber
    ? await db.telephonyRule.findFirst({ where: { phoneNumberId: ourNumber.id, kind: "VOICE" } })
    : null;
  const cfg = (rule?.config ?? {}) as { mode?: string; voicemailPrompt?: string; ivrPrompt?: string };
  const mode = cfg.mode ?? "ring";

  if (mode === "voicemail") {
    return xml(
      generateTwiML({
        voicemailPrompt: cfg.voicemailPrompt || "Please leave a message after the tone.",
        tenantSlug: slug,
      }),
    );
  }
  if (mode === "ivr") {
    return xml(
      generateTwiML({
        voicemailPrompt: cfg.ivrPrompt || "Thanks for calling. Please leave a message and we will return your call.",
        tenantSlug: slug,
      }),
    );
  }

  // ring: forward to the assigned user's forwarding number, else the number itself.
  let dialTarget = ourE164;
  if (ourNumber?.assignedClerkUserId) {
    const pref = await db.userPreference.findUnique({ where: { clerkUserId: ourNumber.assignedClerkUserId } });
    if (pref?.callForwardingE164) dialTarget = pref.callForwardingE164;
  }
  return xml(generateTwiML({ dialNumber: dialTarget, callerId: ourE164, recordingEnabled: true, tenantSlug: slug }));
}
