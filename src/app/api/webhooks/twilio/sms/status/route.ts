/*
 * SMS status callback (Sprint 7). Twilio POSTs delivery receipts here keyed by
 * MessageSid. We map the Twilio MessageStatus to our SmsMessageStatus and stamp
 * deliveredAt when delivered. Signature-validated; no requirePermission.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { requireSingleLegacyMachineBusiness } from "@/lib/security/legacy-machine-business-round55";
import { validatedWebhookTenantSlug, activeWebhookTenantSchema, readBoundedTwilioParams, twilioAccountMatches } from "@/lib/security/legacy-webhook-tenant";
import { validateSignature } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";


const STATUS_MAP: Record<string, string> = {
  queued: "QUEUED",
  sending: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  undelivered: "FAILED",
  failed: "FAILED",
};

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

  const sid = params.MessageSid || params.SmsSid;
  const raw = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  if (!sid) return NextResponse.json({ ok: true });

  const db = getTenantPrisma(schema);
  try { await requireSingleLegacyMachineBusiness(db); }
  catch {
    return NextResponse.json({ ok: false, error: "Callback unavailable." }, { status: 503 });
  }
  const message = await db.smsMessage.findFirst({
    where: { providerMessageSid: sid, direction: "OUTBOUND" },
  });
  if (!message) return NextResponse.json({ ok: true });

  const mapped = STATUS_MAP[raw];
  if (mapped) {
    // Never roll back delivery to SENT or QUEUED when delayed callbacks arrive.
    const transitions: Record<string, string[]> = {
      QUEUED: ["QUEUED"], SENT: ["QUEUED", "SENT"],
      DELIVERED: ["QUEUED", "SENT", "DELIVERED"],
      FAILED: ["QUEUED", "SENT", "FAILED"],
    };
    await db.smsMessage.updateMany({
      where: { id: message.id, status: { in: transitions[mapped] as never } },
      data: {
        status: mapped as never,
        errorCode: mapped === "FAILED" ? (params.ErrorCode ?? "delivery failed").slice(0, 120) : message.errorCode,
        deliveredAt: mapped === "DELIVERED" ? message.deliveredAt ?? new Date() : message.deliveredAt,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
