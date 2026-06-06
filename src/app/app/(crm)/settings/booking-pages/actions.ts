"use server";

/*
 * Booking page settings actions (Sprint 12). CRUD over BookingPage +
 * BookingAvailability windows. BookingPage is indexed for search (BOOKING_PAGE)
 * but is not CRM-audited. Public booking happens elsewhere (no auth); these
 * actions are owner-side configuration so they enforce requirePermission.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { reindex, removeFromIndex } from "@/lib/search";
import { isValidSlug, slugFromName, type CustomQuestion } from "@/lib/calendar/shared";

function currentUserId(): string | null {
  try {
    return auth().userId ?? null;
  } catch {
    return null;
  }
}

export type AvailabilityWindow = { dayOfWeek: number; startMinutes: number; endMinutes: number };

export type BookingPageInput = {
  name: string;
  slug?: string;
  description?: string;
  durationMinutes?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  timezone?: string;
  active?: boolean;
  color?: string;
  locationType?: string;
  locationDetails?: string;
  requireApproval?: boolean;
  redirectUrl?: string;
  customQuestions?: CustomQuestion[];
  availability?: AvailabilityWindow[];
};

/** Find a free slug derived from the requested one, suffixing -N on collision. */
async function uniqueSlug(db: ReturnType<typeof getTenantDb>["db"], base: string, ignoreId?: string): Promise<string> {
  let slug = base;
  for (let n = 2; ; n++) {
    const found = await db.bookingPage.findUnique({ where: { slug } });
    if (!found || found.id === ignoreId) return slug;
    slug = `${base}-${n}`;
  }
}

export async function createBookingPage(input: BookingPageInput): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Booking page name is required.");
  const { db } = getTenantDb();

  const requested = input.slug?.trim() && isValidSlug(input.slug.trim()) ? input.slug.trim() : slugFromName(name) || "meeting";
  const slug = await uniqueSlug(db, requested);

  const page = await db.bookingPage.create({
    data: {
      slug,
      ownerClerkUserId: currentUserId(),
      name,
      description: input.description?.trim() || null,
      durationMinutes: input.durationMinutes ?? 30,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
      minNoticeMinutes: input.minNoticeMinutes ?? 60,
      maxAdvanceDays: input.maxAdvanceDays ?? 30,
      timezone: input.timezone || "UTC",
      active: input.active ?? true,
      color: input.color || "#1d77bd",
      locationType: (input.locationType ?? "VIDEO_LINK") as never,
      locationDetails: input.locationDetails?.trim() || null,
      requireApproval: input.requireApproval ?? false,
      redirectUrl: input.redirectUrl?.trim() || null,
      customQuestions: (input.customQuestions ?? []) as never,
    },
  });

  const windows = input.availability ?? defaultWindows();
  if (windows.length) {
    await db.bookingAvailability.createMany({
      data: windows.map((w) => ({ bookingPageId: page.id, dayOfWeek: w.dayOfWeek, startMinutes: w.startMinutes, endMinutes: w.endMinutes })),
    });
  }

  await reindex(db, "BOOKING_PAGE", page.id);
  revalidatePath("/app/settings/booking-pages");
  return page.id;
}

export async function updateBookingPage(id: string, input: BookingPageInput): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const name = input.name?.trim();
  if (!name) throw new Error("Booking page name is required.");

  let slug: string | undefined;
  if (input.slug?.trim() && isValidSlug(input.slug.trim())) {
    slug = await uniqueSlug(db, input.slug.trim(), id);
  }

  await db.bookingPage.update({
    where: { id },
    data: {
      name,
      ...(slug ? { slug } : {}),
      description: input.description?.trim() || null,
      durationMinutes: input.durationMinutes ?? 30,
      bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: input.bufferAfterMinutes ?? 0,
      minNoticeMinutes: input.minNoticeMinutes ?? 60,
      maxAdvanceDays: input.maxAdvanceDays ?? 30,
      timezone: input.timezone || "UTC",
      active: input.active ?? true,
      color: input.color || "#1d77bd",
      locationType: (input.locationType ?? "VIDEO_LINK") as never,
      locationDetails: input.locationDetails?.trim() || null,
      requireApproval: input.requireApproval ?? false,
      redirectUrl: input.redirectUrl?.trim() || null,
      customQuestions: (input.customQuestions ?? []) as never,
    },
  });

  if (input.availability) {
    await db.bookingAvailability.deleteMany({ where: { bookingPageId: id } });
    if (input.availability.length) {
      await db.bookingAvailability.createMany({
        data: input.availability.map((w) => ({ bookingPageId: id, dayOfWeek: w.dayOfWeek, startMinutes: w.startMinutes, endMinutes: w.endMinutes })),
      });
    }
  }

  await reindex(db, "BOOKING_PAGE", id);
  revalidatePath("/app/settings/booking-pages");
}

export async function deleteBookingPage(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.bookingPage.delete({ where: { id } });
  await removeFromIndex(db, "BOOKING_PAGE", id);
  revalidatePath("/app/settings/booking-pages");
}

/** Default Mon-Fri 9:00-17:00 windows. */
function defaultWindows(): AvailabilityWindow[] {
  return [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinutes: 540, endMinutes: 1020 }));
}
