/*
 * SMS status callback (Sprint 7). Twilio POSTs delivery receipts here keyed by
 * MessageSid. We map the Twilio MessageStatus to our SmsMessageStatus and stamp
 * deliveredAt when delivered. Signature-validated; no requirePermission.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validateSignature } from "@/lib/telephony/twilio";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";

const STATUS_MAP: Record<string, string> = {
  queued: "QUEUED",
  sending: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  undelivered: "FAILED",
  failed: "FAILED",
};

export async function POST(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("tenant") ?? DEFAULT_TENANT).toLowerCase();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

  const sid = params.MessageSid || params.SmsSid;
  const raw = (params.MessageStatus || params.SmsStatus || "").toLowerCase();
  if (!sid) return NextResponse.json({ ok: true });

  const db = getTenantPrisma(schemaNameForSlug(slug));
  const message = await db.smsMessage.findFirst({ where: { providerMessageSid: sid } });
  if (!message) return NextResponse.json({ ok: true });

  const mapped = STATUS_MAP[raw];
  if (mapped) {
    await db.smsMessage.update({
      where: { id: message.id },
      data: {
        status: mapped as never,
        errorCode: mapped === "FAILED" ? params.ErrorCode ?? "delivery failed" : message.errorCode,
        deliveredAt: mapped === "DELIVERED" ? new Date() : message.deliveredAt,
      },
    });
  }
  return NextResponse.json({ ok: true });
}
