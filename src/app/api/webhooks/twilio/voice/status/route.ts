/*
 * Voice status callback (Sprint 7). Twilio POSTs call lifecycle events here
 * (initiated / ringing / answered / completed). We map CallStatus, stamp
 * answered/ended times + duration, and on completion auto-create a CALL
 * CrmActivity attached to whatever record the Call links to, then fire a
 * CALL_COMPLETED automation event.
 *
 * Auth: validated by X-Twilio-Signature. No requirePermission - public endpoint.
 * Tenant via ?tenant=<slug> (default "acme").
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { validateSignature } from "@/lib/telephony/twilio";
import { dispatchAutomation } from "@/lib/automations/dispatch";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT = "acme";

const STATUS_MAP: Record<string, string> = {
  queued: "QUEUED",
  initiated: "QUEUED",
  ringing: "RINGING",
  "in-progress": "IN_PROGRESS",
  answered: "IN_PROGRESS",
  completed: "COMPLETED",
  busy: "BUSY",
  "no-answer": "NO_ANSWER",
  failed: "FAILED",
  canceled: "CANCELED",
};

const ACTIVITY_FK: Record<string, "contactId" | "leadId" | "dealId" | "companyId"> = {
  CONTACT: "contactId",
  LEAD: "leadId",
  DEAL: "dealId",
  COMPANY: "companyId",
};

export async function POST(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("tenant") ?? DEFAULT_TENANT).toLowerCase();

  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const signature = req.headers.get("x-twilio-signature");
  const ok = await validateSignature(signature, req.nextUrl.toString(), params);
  if (!ok) return NextResponse.json({ ok: false, error: "Invalid signature." }, { status: 401 });

  const callSid = params.CallSid || null;
  if (!callSid) return NextResponse.json({ ok: true });

  const twilioStatus = (params.CallStatus ?? "").toLowerCase();
  const mapped = STATUS_MAP[twilioStatus];
  const durationSec = Number(params.CallDuration ?? "0") || 0;

  const db = getTenantPrisma(schemaNameForSlug(slug));
  const call = await db.call.findFirst({ where: { providerCallSid: callSid } });
  if (!call) return NextResponse.json({ ok: true });

  const isFinal = mapped === "COMPLETED" || mapped === "NO_ANSWER" || mapped === "BUSY" || mapped === "FAILED" || mapped === "CANCELED";
  const alreadyLogged = Boolean(call.endedAt);

  await db.call.update({
    where: { id: call.id },
    data: {
      ...(mapped ? { status: mapped as never } : {}),
      ...(mapped === "IN_PROGRESS" && !call.answeredAt ? { answeredAt: new Date() } : {}),
      ...(isFinal ? { endedAt: new Date(), durationSec } : {}),
    },
  });

  // On the first final event, write a CALL activity + fire automation.
  if (isFinal && !alreadyLogged) {
    const entityType = call.contactId ? "CONTACT" : call.leadId ? "LEAD" : call.dealId ? "DEAL" : call.companyId ? "COMPANY" : null;
    const entityId = call.contactId ?? call.leadId ?? call.dealId ?? call.companyId ?? null;

    if (entityType && entityId) {
      const fk = ACTIVITY_FK[entityType]!;
      const peer = call.direction === "OUTBOUND" ? call.toE164 : call.fromE164;
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const summary =
        mapped === "COMPLETED"
          ? `${call.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call with ${peer} (${mins}m ${secs}s)`
          : `${call.direction === "OUTBOUND" ? "Outbound" : "Inbound"} call with ${peer} - ${mapped}`;
      await db.crmActivity.create({
        data: {
          type: "CALL" as never,
          subject: summary,
          body: null,
          completedAt: new Date(),
          [fk]: entityId,
        } as never,
      });

      await dispatchAutomation(
        {
          type: "CALL_COMPLETED",
          entityType: entityType as never,
          entityId,
          payload: { callId: call.id, status: mapped, durationSec, peer },
        },
        db,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
