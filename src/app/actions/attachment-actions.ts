"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

type ParentKind = "bill" | "invoice" | "journalEntry";

function pathForParent(tenantSlug: string, kind: ParentKind, parentId: string): string {
  switch (kind) {
    case "bill":
      return `/${tenantSlug}/ap/bills/${parentId}`;
    case "invoice":
      return `/${tenantSlug}/ar/invoices/${parentId}`;
    case "journalEntry":
      return `/${tenantSlug}/books/journal/${parentId}`;
  }
}

async function verifyParent(
  tenantId: string,
  kind: ParentKind,
  parentId: string,
): Promise<{ entityId: string } | null> {
  if (kind === "bill") {
    const b = await db.bill.findFirst({
      where: { id: parentId, tenantId },
      select: { entityId: true },
    });
    return b ? { entityId: b.entityId } : null;
  }
  if (kind === "invoice") {
    const i = await db.invoice.findFirst({
      where: { id: parentId, tenantId },
      select: { entityId: true },
    });
    return i ? { entityId: i.entityId } : null;
  }
  const je = await db.journalEntry.findFirst({
    where: { id: parentId, tenantId },
    select: { entityId: true },
  });
  return je ? { entityId: je.entityId } : null;
}

export async function addAttachmentAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const kind = String(formData.get("kind") ?? "") as ParentKind;
  const parentId = String(formData.get("parentId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const filename = String(formData.get("filename") ?? "").trim() || url.split("/").pop() || "attachment";
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const contentType = String(formData.get("contentType") ?? "").trim() || null;

  if (!tenantSlug || !parentId || !["bill", "invoice", "journalEntry"].includes(kind)) {
    throw new Error("Missing or invalid params.");
  }
  if (!url) throw new Error("URL is required.");
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("URL must start with http:// or https://");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const parent = await verifyParent(auth.tenant.id, kind, parentId);
  if (!parent) throw new Error("Parent record not found.");

  await db.attachment.create({
    data: {
      tenantId: auth.tenant.id,
      entityId: parent.entityId,
      billId: kind === "bill" ? parentId : null,
      invoiceId: kind === "invoice" ? parentId : null,
      journalEntryId: kind === "journalEntry" ? parentId : null,
      filename,
      url,
      contentType,
      storage: "URL",
      uploadedByUserId: auth.user.id,
      notes,
    },
  });

  revalidatePath(pathForParent(tenantSlug, kind, parentId));
}

export async function deleteAttachmentAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const attachmentId = String(formData.get("attachmentId") ?? "");
  const kind = String(formData.get("kind") ?? "") as ParentKind;
  const parentId = String(formData.get("parentId") ?? "");

  if (!tenantSlug || !attachmentId) throw new Error("Missing params.");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  // Only delete if it belongs to this tenant.
  const att = await db.attachment.findFirst({
    where: { id: attachmentId, tenantId: auth.tenant.id },
    select: { id: true },
  });
  if (!att) throw new Error("Attachment not found.");

  await db.attachment.delete({ where: { id: attachmentId } });

  if (kind && parentId) {
    revalidatePath(pathForParent(tenantSlug, kind, parentId));
  }
}
