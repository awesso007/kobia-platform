"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import type {
  DocumentRequestStatus,
  RequestItemStatus,
} from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const PORTAL_COOKIE = "kobia_portal_session";
const SESSION_TTL_DAYS = 30;

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function newToken(): string {
  return randomBytes(28).toString("base64url");
}

// ─── FIRM-SIDE ACTIONS ──────────────────────────────────────────────────────

export async function inviteClientPortalUserAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const entityId = formData.get("entityId") as string;
  const name = ((formData.get("name") as string) || "").trim();
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();

  if (!entityId || !name || !email) {
    throw new Error("Entity, name, and email are required");
  }

  await db.clientPortalUser.upsert({
    where: {
      tenantId_entityId_email: {
        tenantId: auth.tenant.id,
        entityId,
        email,
      },
    },
    update: { name, isActive: true },
    create: {
      tenantId: auth.tenant.id,
      entityId,
      name,
      email,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/clients`);
}

export async function deactivatePortalUserAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.clientPortalUser.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("User not found");

  await db.clientPortalUser.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath(`/${tenantSlug}/practice/clients`);
}

export async function generatePortalMagicLinkAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const portalUserId = formData.get("portalUserId") as string;
  const user = await db.clientPortalUser.findFirst({
    where: { id: portalUserId, tenantId: auth.tenant.id },
  });
  if (!user) throw new Error("Portal user not found");

  const token = newToken();
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.portalSession.create({
    data: {
      tenantId: auth.tenant.id,
      portalUserId,
      token,
      expiresAt,
    },
  });

  // We can't display the link via revalidatePath, so persist it as a transient
  // success cookie that the page can read. Lifetime = 60s.
  cookies().set(`kobia_last_magic_${portalUserId}`, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60,
    path: `/${tenantSlug}`,
  });

  revalidatePath(`/${tenantSlug}/practice/clients`);
}

// ─── DOCUMENT REQUESTS (FIRM-SIDE) ──────────────────────────────────────────

export async function createDocumentRequestAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const entityId = formData.get("entityId") as string;
  const engagementId = (formData.get("engagementId") as string) || null;
  const title = ((formData.get("title") as string) || "").trim();
  const description =
    ((formData.get("description") as string) || "").trim() || null;
  const dueDateStr = (formData.get("dueDate") as string) || null;
  const itemsRaw = (formData.get("items") as string) || "";

  if (!entityId || !title) {
    throw new Error("Entity and title are required");
  }

  const items = itemsRaw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (items.length === 0) {
    throw new Error("At least one item is required");
  }

  const dueDate = dueDateStr ? new Date(dueDateStr + "T12:00:00Z") : null;

  await db.portalDocumentRequest.create({
    data: {
      tenantId: auth.tenant.id,
      entityId,
      engagementId,
      title,
      description,
      dueDate,
      createdByUserId: auth.user.id,
      items: {
        create: items.map((label) => ({
          tenantId: auth.tenant.id,
          label,
        })),
      },
    },
  });

  revalidatePath(`/${tenantSlug}/practice/requests`);
  redirect(`/${tenantSlug}/practice/requests`);
}

export async function updateRequestStatusAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const status = formData.get("status") as DocumentRequestStatus;

  const existing = await db.portalDocumentRequest.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Request not found");

  await db.portalDocumentRequest.update({
    where: { id },
    data: {
      status,
      completedAt: status === "COMPLETE" ? new Date() : null,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/requests`);
  revalidatePath(`/${tenantSlug}/practice/requests/${id}`);
}

export async function markItemStatusAction(
  formData: FormData
): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const status = formData.get("status") as RequestItemStatus;

  const item = await db.portalRequestItem.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!item) throw new Error("Item not found");

  await db.portalRequestItem.update({
    where: { id },
    data: {
      status,
      completedAt:
        status === "RECEIVED" || status === "WAIVED" ? new Date() : null,
    },
  });

  // Auto-roll request status
  const remaining = await db.portalRequestItem.count({
    where: { requestId: item.requestId, status: "NEEDED" },
  });
  await db.portalDocumentRequest.update({
    where: { id: item.requestId },
    data: {
      status:
        remaining === 0
          ? "COMPLETE"
          : remaining > 0
            ? "PARTIAL"
            : "OPEN",
      completedAt: remaining === 0 ? new Date() : null,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/requests/${item.requestId}`);
}

// ─── PORTAL (CLIENT-SIDE) ACTIONS ───────────────────────────────────────────

export async function uploadPortalDocumentAction(
  formData: FormData
): Promise<void> {
  const token = cookies().get(PORTAL_COOKIE)?.value;
  if (!token) throw new Error("Not signed in");

  const session = await db.portalSession.findUnique({
    where: { token },
    include: { portalUser: true },
  });
  if (!session || !session.portalUser.isActive) {
    throw new Error("Session invalid");
  }

  const requestItemId = (formData.get("requestItemId") as string) || null;
  const fileName = ((formData.get("fileName") as string) || "").trim();
  const fileUrl = ((formData.get("fileUrl") as string) || "").trim();
  const note = ((formData.get("note") as string) || "").trim() || null;

  if (!fileName || !fileUrl) {
    throw new Error("File name and URL are required");
  }

  await db.portalUpload.create({
    data: {
      tenantId: session.tenantId,
      entityId: session.portalUser.entityId,
      requestItemId,
      portalUserId: session.portalUserId,
      fileName,
      fileUrl,
      note,
    },
  });

  // If linked to a request item, mark it RECEIVED
  if (requestItemId) {
    await db.portalRequestItem.update({
      where: { id: requestItemId },
      data: { status: "RECEIVED", completedAt: new Date() },
    });

    const item = await db.portalRequestItem.findUnique({
      where: { id: requestItemId },
    });
    if (item) {
      const remaining = await db.portalRequestItem.count({
        where: { requestId: item.requestId, status: "NEEDED" },
      });
      await db.portalDocumentRequest.update({
        where: { id: item.requestId },
        data: {
          status: remaining === 0 ? "COMPLETE" : "PARTIAL",
          completedAt: remaining === 0 ? new Date() : null,
        },
      });
    }
  }

  revalidatePath(`/portal`);
}

export async function portalSignOutAction(): Promise<void> {
  cookies().delete(PORTAL_COOKIE);
  redirect("/portal/signed-out");
}
