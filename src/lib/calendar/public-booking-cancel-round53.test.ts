import { describe, expect, it, vi } from "vitest";
import { cancelPublicBookingAtomic } from "./public-booking-cancel-round53";
const validToken = "1234567890abcdef".repeat(2) + "abcd";
function fixture() {
  const booking = {
    id: "booking-a", eventId: "event-a", status: "CONFIRMED",
    rescheduleToken: validToken,
    bookingPage: { name: "Demo appointment", ownerClerkUserId: "owner-test" },
  };
  const tx = {
    booking: {
      findFirst: vi.fn().mockResolvedValue(booking),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    calendarEvent: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const db = { $transaction: vi.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)) };
  return { db, tx };
}
describe("Round 53 booking cancellation coupled state boundary", () => {
  it("validates bearer secret and returns NOT_FOUND before mutation", async () => {
    const { db, tx } = fixture();
    const result = await cancelPublicBookingAtomic(db as never,
      { slug: "booking-page", bookingId: "booking-a", token: "bad" });
    expect(result.kind).toBe("NOT_FOUND");
    expect(tx.booking.updateMany).not.toHaveBeenCalled();
    expect(tx.calendarEvent.updateMany).not.toHaveBeenCalled();
  });
  it("updates linked booking/calendar in one transaction and remains idempotent", async () => {
    const { db, tx } = fixture();
    const result = await cancelPublicBookingAtomic(db as never,
      { slug: "booking-page", bookingId: "booking-a", token: validToken });
    expect(result.kind).toBe("CANCELED");
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.$transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(tx.booking.updateMany).toHaveBeenCalledOnce();
    expect(tx.calendarEvent.updateMany).toHaveBeenCalledOnce();
    tx.booking.updateMany.mockResolvedValueOnce({ count: 0 });
    const again = await cancelPublicBookingAtomic(db as never,
      { slug: "booking-page", bookingId: "booking-a", token: validToken });
    expect(again.kind).toBe("ALREADY");
    expect(tx.calendarEvent.updateMany).toHaveBeenCalledTimes(1);
  });
  it("propagates calendar update failure to abort the transaction", async () => {
    const { db, tx } = fixture();
    tx.calendarEvent.updateMany.mockRejectedValueOnce(new Error("DB failed"));
    await expect(cancelPublicBookingAtomic(db as never,
      { slug: "booking-page", bookingId: "booking-a", token: validToken }))
      .rejects.toThrow("DB failed");
  });
});
