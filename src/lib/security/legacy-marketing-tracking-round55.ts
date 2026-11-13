/**
 * Round 55: signed email tracking is telemetry, never permission to ignore a
 * recipient's already recorded unsubscribe. The subscription SELECT and
 * conditional state mutation share one SERIALIZABLE tenant transaction.
 * A revoked opt-out, late email scanner or duplicate pixel cannot resurrect
 * UNSUBSCRIBED or update a counter after the recipient opted out.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

export async function recordSignedLegacyTracking(
  db: PrismaClient, recipientId: string, purpose: "OPEN" | "CLICK",
): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(recipientId)) return false;
  return db.$transaction(async tx => {
    const recipient = await tx.broadcastRecipient.findUnique({
      where: { id: recipientId },
      select: { id: true, email: true },
    });
    if (!recipient?.email || recipient.email.length > 254) return false;
    const optedOut = await tx.unsubscribe.findFirst({
      where: { email: { equals: recipient.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (optedOut) return false;
    if (purpose === "OPEN") {
      const changed = await tx.broadcastRecipient.updateMany({
        where: { id: recipient.id,
          status: { in: ["SENT", "DELIVERED"] }, openedAt: null },
        data: { status: "OPENED", openedAt: new Date() },
      });
      return changed.count === 1;
    }
    const changed = await tx.broadcastRecipient.updateMany({
      where: { id: recipient.id,
        status: { in: ["SENT", "DELIVERED", "OPENED"] }, clickedAt: null },
      data: { status: "CLICKED", clickedAt: new Date() },
    });
    return changed.count === 1;
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
