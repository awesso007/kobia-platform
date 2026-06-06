"use server";

/*
 * Meeting room settings actions (Sprint 12). CRUD over MeetingRoom rows. Rooms
 * are not CRM-audited or indexed entities, so we just enforce requirePermission
 * and revalidate the settings surface.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";

export async function createRoom(input: { name: string; location?: string; capacity?: number | null; color?: string }): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Room name is required.");
  const { db } = getTenantDb();
  const room = await db.meetingRoom.create({
    data: {
      name,
      location: input.location?.trim() || null,
      capacity: input.capacity ?? null,
      color: input.color || "#7d4aea",
    },
  });
  revalidatePath("/app/settings/rooms");
  return room.id;
}

export async function updateRoom(id: string, input: { name?: string; location?: string | null; capacity?: number | null; color?: string; active?: boolean }): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.meetingRoom.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.location !== undefined ? { location: input.location?.trim() || null } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
  revalidatePath("/app/settings/rooms");
}

export async function deleteRoom(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.meetingRoom.delete({ where: { id } });
  revalidatePath("/app/settings/rooms");
}
