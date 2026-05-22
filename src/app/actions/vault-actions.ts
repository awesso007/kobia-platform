"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { VaultDocCategory } from "@prisma/client";
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

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function createVaultDocument(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);

  const title = s(fd, "title");
  if (!title) throw new Error("Title required");
  const url = s(fd, "url");
  if (!url) throw new Error("URL required");

  await db.vaultDocument.create({
    data: {
      tenantId: auth.tenant.id,
      title,
      url,
      category: (s(fd, "category") ?? "OTHER") as VaultDocCategory,
      description: s(fd, "description"),
      tags: s(fd, "tags"),
      entityId: s(fd, "entityId"),
      customerId: s(fd, "customerId"),
      vendorId: s(fd, "vendorId"),
      expiresAt: parseDate(s(fd, "expiresAt")),
      uploadedByUserId: auth.user.id,
    },
  });

  revalidatePath(`/${slug}/vault`);
  redirect(`/${slug}/vault`);
}

export async function deleteVaultDocument(slug: string, fd: FormData): Promise<void> {
  const auth = await getAuthContext(slug);
  if (!auth) throw new Error("Unauthorized");
  assertRole(auth.role);

  const id = s(fd, "id");
  if (!id) throw new Error("Missing id");

  await db.vaultDocument.deleteMany({
    where: { id, tenantId: auth.tenant.id },
  });

  revalidatePath(`/${slug}/vault`);
}
