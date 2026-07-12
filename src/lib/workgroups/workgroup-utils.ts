/*
 * Workgroup pure helpers (Sprint 22). No "use client" and no db access, so both
 * server and client code can import these. Keep this file free of React and
 * Prisma imports.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type WorkgroupVisibility = "PUBLIC" | "PRIVATE" | "SECRET";
export type WorkgroupMemberRole = "OWNER" | "MODERATOR" | "MEMBER";

export const VISIBILITY_LABELS: Record<WorkgroupVisibility, string> = {
  PUBLIC: "Public",
  PRIVATE: "Private",
  SECRET: "Secret",
};

export const VISIBILITY_HINTS: Record<WorkgroupVisibility, string> = {
  PUBLIC: "Anyone in the workspace can find and join this group.",
  PRIVATE: "Anyone can find this group and request to join. Members approve requests.",
  SECRET: "Hidden from discovery. People join by invite only.",
};

export function visibilityLabel(v: string): string {
  return VISIBILITY_LABELS[v as WorkgroupVisibility] ?? v;
}

/** Moderators and owners can manage members, invites, and settings. */
export function canManage(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "MODERATOR";
}

/** Any member (owner, moderator, member) may post to the group feed. */
export function canPostToGroup(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "MODERATOR" || role === "MEMBER";
}

/** Fallback icon: first letter of the group name, uppercased. */
export function initialFromName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}

/** Slugify a group name: lowercase, hyphen-separated, alnum only. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
