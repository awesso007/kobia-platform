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
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { resolveLinkForPhone } from "@/lib/telephony/link";
import { validateSignature, generateTwiML } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml" } });
}

export async function POST(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("tenant") ?? DEFAULT_TENANT).toLowerCase();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const callSid = params.CallSid || null;
  const direction = params.Direction?.startsWith("outbound") ? "OUTBOUND" : "INBOUND";

  const db = getTenantPrisma(schemaNameForSlug(slug));

  // The "our" number is To for inbound, From for outbound-dial legs.
  const ourE164 = direction === "OUTBOUND" ? from : to;
  const peerE164 = direction === "OUTBOUND" ? to : from;
  const ourNumber = await db.phoneNumber.findUnique({ where: { e164: ourE164 } });

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
    return xml(generateTwiML({ dialNumber: peerE164, callerId: ourE164, recordingEnabled: true }));
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
      }),
    );
  }
  if (mode === "ivr") {
    return xml(
      generateTwiML({
        voicemailPrompt: cfg.ivrPrompt || "Thanks for calling. Please leave a message and we will return your call.",
      }),
    );
  }

  // ring: forward to the assigned user's forwarding number, else the number itself.
  let dialTarget = ourE164;
  if (ourNumber?.assignedClerkUserId) {
    const pref = await db.userPreference.findUnique({ where: { clerkUserId: ourNumber.assignedClerkUserId } });
    if (pref?.callForwardingE164) dialTarget = pref.callForwardingE164;
  }
  return xml(generateTwiML({ dialNumber: dialTarget, callerId: ourE164, recordingEnabled: true }));
}
