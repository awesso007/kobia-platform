"use server";

/*
 * Workspace settings server actions (Sprint 5). Update the active tenant's
 * registry row: display name, theme colors, default timezone, logo URL. Slug
 * changes are intentionally NOT supported here (the slug is the schema id and
 * renaming it would require moving a Postgres schema). Gated by
 * workspace:manage.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPlatformDb } from "@/lib/db/platform";
import { requirePermission } from "@/lib/rbac/require-permission";

const HEX = /^#[0-9a-fA-F]{6}$/;

function activeSlug(): string | null {
  try {
    return headers().get("x-tenant-id");
  } catch {
    return null;
  }
}

export type WorkspaceInput = {
  displayName: string;
  primary: string;
  accent: string;
  timezone: string;
  logoUrl: string;
};

export async function updateWorkspace(input: WorkspaceInput): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("workspace:manage");
  const slug = activeSlug();
  if (!slug) return { ok: false, error: "No active workspace." };

  const primary = HEX.test(input.primary) ? input.primary : "#1d77bd";
  const accent = HEX.test(input.accent) ? input.accent : "#7d4aea";

  try {
    await getPlatformDb().tenantRegistry.update({
      where: { slug },
      data: {
        displayName: input.displayName?.trim() || null,
        theme: { primary, accent },
        timezone: input.timezone?.trim() || null,
        logoUrl: input.logoUrl?.trim() || null,
      },
    });
    revalidatePath("/app/settings/workspace");
    revalidatePath("/app", "layout");
    return { ok: true };
  } catch (err) {
    console.error("[workspace] update failed", err);
    return { ok: false, error: "Could not save workspace settings." };
  }
}
