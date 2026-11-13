/*
 * Voice recording callback (Sprint 7). Twilio POSTs here when a call recording
 * (or voicemail) is ready. We attach the recording URL + duration to the Call
 * row. Voicemail recordings (from the <Record> verb) land here too; we store
 * them in voicemailUrl when the call had no answered leg.
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
import { validateSignature } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";


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

  const callSid = params.CallSid || null;
  const recordingUrl = params.RecordingUrl || null;
  const seconds = Number(params.RecordingDuration ?? "0");
  const recordingDurationSec = Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : 0;
  // Do not turn a provider-signed recording link into a generic fetch SSRF
  // target. We only persist the expected Twilio HTTPS recording endpoint.
  let safeRecording = false;
  if (recordingUrl && recordingUrl.length < 2048) {
    try {
      const u = new URL(recordingUrl);
      safeRecording = u.protocol === "https:" && u.hostname === "api.twilio.com" &&
        !u.username && !u.password;
    } catch { safeRecording = false; }
  }
  if (!callSid || !recordingUrl || !safeRecording) return NextResponse.json({ ok: true });

  const db = getTenantPrisma(schema);
  try { await requireSingleLegacyMachineBusiness(db); }
  catch {
    return NextResponse.json({ ok: false, error: "Callback unavailable." }, { status: 503 });
  }
  const call = await db.call.findFirst({ where: { providerCallSid: callSid } });
  if (!call) return NextResponse.json({ ok: true });

  const isVoicemail = !call.answeredAt;
  await db.call.update({
    where: { id: call.id },
    data: {
      recordingUrl,
      recordingDurationSec,
      ...(isVoicemail ? { voicemailUrl: recordingUrl } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
