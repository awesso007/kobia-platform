/**
 * Round 53: authenticated-by-capability booking cancellation.
 * Token comparison, cancellation state and linked calendar event update occur
 * within one serializable tenant DB transaction; notifications occur afterward.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { secureBookingManageTokenMatches } from "@/lib/security/booking-manage-token";

export async function cancelPublicBookingAtomic(
  db: PrismaClient, input: {
    slug: string; bookingId: string; token: string;
  },
) {
  return db.$transaction(async tx => {
    const booking = await tx.booking.findFirst({
      where: { id: input.bookingId, bookingPage: { slug: input.slug } },
      include: { bookingPage: { select: { name: true, ownerClerkUserId: true } } },
    });
    if (!booking || !secureBookingManageTokenMatches(input.token, booking.rescheduleToken)) {
      return { kind: "NOT_FOUND" as const, booking: null };
    }
    const canceled = await tx.booking.updateMany({
      where: {
        id: booking.id, rescheduleToken: booking.rescheduleToken,
        status: { not: "CANCELED" },
      },
      data: { status: "CANCELED" },
    });
    if (canceled.count > 0 && booking.eventId) {
      // A failure rolls back BOTH the booking and the event update.
      await tx.calendarEvent.updateMany({
        where: { id: booking.eventId }, data: { status: "CANCELED" as never },
      });
    }
    return { kind: canceled.count ? "CANCELED" as const : "ALREADY" as const, booking };
  }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 });
}
