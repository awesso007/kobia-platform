"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

type Subject = "ENTITY" | "CUSTOMER" | "VENDOR" | "LEAD" | "ENGAGEMENT";

function authorNameFrom(user: { email: string | null; firstName?: string | null; lastName?: string | null }): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.email || "Unknown";
}

export async function createNote(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const subjectType = String(formData.get("subjectType") ?? "") as Subject;
  const subjectId = String(formData.get("subjectId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const isPinned = formData.get("isPinned") === "on";
  const revalidate = String(formData.get("revalidate") ?? "");

  if (!tenantSlug || !subjectType || !subjectId || !body) return;

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return;

  await db.clientNote.create({
    data: {
      tenantId: auth.tenant.id,
      subjectType,
      subjectId,
      authorId: auth.user.id,
      authorName: authorNameFrom(auth.user),
      body,
      isPinned,
      parentId,
    },
  });

  if (revalidate) revalidatePath(revalidate);
}

export async function togglePinNote(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const revalidate = String(formData.get("revalidate") ?? "");
  if (!tenantSlug || !noteId) return;

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return;

  const note = await db.clientNote.findFirst({
    where: { id: noteId, tenantId: auth.tenant.id },
  });
  if (!note) return;

  await db.clientNote.update({
    where: { id: noteId },
    data: { isPinned: !note.isPinned },
  });

  if (revalidate) revalidatePath(revalidate);
}

export async function deleteNote(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const noteId = String(formData.get("noteId") ?? "");
  const revalidate = String(formData.get("revalidate") ?? "");
  if (!tenantSlug || !noteId) return;

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return;

  await db.clientNote.deleteMany({
    where: { id: noteId, tenantId: auth.tenant.id },
  });

  if (revalidate) revalidatePath(revalidate);
}
