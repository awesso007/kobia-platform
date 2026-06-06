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
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validateSignature } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";

export async function POST(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("tenant") ?? DEFAULT_TENANT).toLowerCase();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

  const callSid = params.CallSid || null;
  const recordingUrl = params.RecordingUrl || null;
  const recordingDurationSec = Number(params.RecordingDuration ?? "0") || 0;
  if (!callSid || !recordingUrl) return NextResponse.json({ ok: true });

  const db = getTenantPrisma(schemaNameForSlug(slug));
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
