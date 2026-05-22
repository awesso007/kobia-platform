"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { CommChannel, CommDirection } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function logCommunication(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);

  const subject = s(fd, "subject");
  if (!subject) throw new Error("Subject required");

  await db.customerCommunication.create({
    data: {
      tenantId: auth.tenant.id,
      subject,
      body: s(fd, "body"),
      channel: (s(fd, "channel") ?? "EMAIL") as CommChannel,
      direction: (s(fd, "direction") ?? "OUTBOUND") as CommDirection,
      recipient: s(fd, "recipient"),
      customerId: s(fd, "customerId"),
      entityId: s(fd, "entityId"),
      sentByUserId: auth.user.id,
    },
  });

  revalidatePath(`/${slug}/communications`);
  redirect(`/${slug}/communications`);
}

export async function deleteCommunication(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);

  const id = s(fd, "id");
  if (!id) throw new Error("Missing id");

  await db.customerCommunication.deleteMany({
    where: { id, tenantId: auth.tenant.id },
  });

  revalidatePath(`/${slug}/communications`);
}

/**
 * Helper for other server actions to log an outbound comm (e.g., when an
 * invoice email is sent, a statement is emailed, or a letter is delivered).
 * Failures are swallowed to avoid blocking the parent action.
 */
export async function recordOutboundComm(args: {
  tenantId: string;
  channel: CommChannel;
  subject: string;
  body?: string | null;
  recipient?: string | null;
  customerId?: string | null;
  entityId?: string | null;
  invoiceId?: string | null;
  statementBatchId?: string | null;
  letterId?: string | null;
  sentByUserId?: string | null;
}): Promise<void> {
  try {
    await db.customerCommunication.create({
      data: {
        tenantId: args.tenantId,
        channel: args.channel,
        direction: "OUTBOUND",
        subject: args.subject,
        body: args.body ?? null,
        recipient: args.recipient ?? null,
        customerId: args.customerId ?? null,
        entityId: args.entityId ?? null,
        invoiceId: args.invoiceId ?? null,
        statementBatchId: args.statementBatchId ?? null,
        letterId: args.letterId ?? null,
        sentByUserId: args.sentByUserId ?? null,
      },
    });
  } catch (err) {
    console.error("[comms] recordOutboundComm failed:", err);
  }
}
