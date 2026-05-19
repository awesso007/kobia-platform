"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import type { EngagementType, LetterStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { substituteLetterVariables } from "@/lib/practice/letter-variables";

function assertRole(role: string) {
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(role)) {
    throw new Error("Forbidden");
  }
}

function makeShareToken(): string {
  return randomBytes(24).toString("base64url");
}

// ─── TEMPLATES ──────────────────────────────────────────────────────────────

export async function createTemplateAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const name = ((formData.get("name") as string) || "").trim();
  const subject = ((formData.get("subject") as string) || "").trim();
  const bodyMarkdown = ((formData.get("bodyMarkdown") as string) || "").trim();
  const engagementType =
    ((formData.get("engagementType") as EngagementType) || "BOOKKEEPING");
  const feeText = ((formData.get("feeText") as string) || "").trim() || null;

  if (!name || !subject || !bodyMarkdown) {
    throw new Error("Name, subject, and body are required");
  }

  await db.engagementLetterTemplate.create({
    data: {
      tenantId: auth.tenant.id,
      name,
      subject,
      bodyMarkdown,
      engagementType,
      feeText,
      createdByUserId: auth.user.id,
    },
  });

  revalidatePath(`/${tenantSlug}/practice/templates`);
  redirect(`/${tenantSlug}/practice/templates`);
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const name = ((formData.get("name") as string) || "").trim();
  const subject = ((formData.get("subject") as string) || "").trim();
  const bodyMarkdown = ((formData.get("bodyMarkdown") as string) || "").trim();
  const engagementType =
    ((formData.get("engagementType") as EngagementType) || "BOOKKEEPING");
  const feeText = ((formData.get("feeText") as string) || "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  const existing = await db.engagementLetterTemplate.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Template not found");

  await db.engagementLetterTemplate.update({
    where: { id },
    data: { name, subject, bodyMarkdown, engagementType, feeText, isActive },
  });

  revalidatePath(`/${tenantSlug}/practice/templates`);
  redirect(`/${tenantSlug}/practice/templates`);
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.engagementLetterTemplate.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Template not found");

  // Soft delete by deactivating; preserve referential integrity for letters
  await db.engagementLetterTemplate.update({
    where: { id },
    data: { isActive: false },
  });

  revalidatePath(`/${tenantSlug}/practice/templates`);
}

// ─── LETTERS ────────────────────────────────────────────────────────────────

export async function generateLetterAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const engagementId = formData.get("engagementId") as string;
  const templateId = (formData.get("templateId") as string) || null;
  const signerName = ((formData.get("signerName") as string) || "").trim() || null;
  const signerEmail = ((formData.get("signerEmail") as string) || "").trim() || null;
  const feeTextOverride =
    ((formData.get("feeText") as string) || "").trim() || null;

  const engagement = await db.engagement.findFirst({
    where: { id: engagementId, tenantId: auth.tenant.id },
    include: { entity: true },
  });
  if (!engagement) throw new Error("Engagement not found");

  let subject = "Engagement Letter";
  let body = "";
  let feeText = feeTextOverride;

  if (templateId) {
    const tpl = await db.engagementLetterTemplate.findFirst({
      where: { id: templateId, tenantId: auth.tenant.id },
    });
    if (!tpl) throw new Error("Template not found");
    subject = tpl.subject;
    body = tpl.bodyMarkdown;
    feeText = feeText ?? tpl.feeText;
  } else {
    body =
      "Dear {{client_name}},\n\nThis letter confirms our engagement for {{engagement_name}} beginning {{start_date}}.\n\nFee: {{fee_text}}\n\nSincerely,\n{{firm_name}}";
  }

  const ctx = {
    clientName: engagement.entity.name,
    firmName: auth.tenant.name,
    engagementName: engagement.name,
    engagementType: engagement.type,
    startDate: engagement.startDate,
    targetDate: engagement.targetDate,
    feeText,
    signerName,
    signerEmail,
  };

  const renderedSubject = substituteLetterVariables(subject, ctx);
  const renderedBody = substituteLetterVariables(body, ctx);

  const letter = await db.engagementLetter.create({
    data: {
      tenantId: auth.tenant.id,
      engagementId,
      templateId,
      subject: renderedSubject,
      bodyMarkdown: renderedBody,
      feeText,
      signerName,
      signerEmail,
      createdByUserId: auth.user.id,
      shareToken: makeShareToken(),
    },
  });

  revalidatePath(`/${tenantSlug}/practice/engagements/${engagementId}`);
  revalidatePath(`/${tenantSlug}/practice/letters`);
  redirect(`/${tenantSlug}/practice/letters/${letter.id}`);
}

export async function updateLetterDraftAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const subject = ((formData.get("subject") as string) || "").trim();
  const bodyMarkdown = ((formData.get("bodyMarkdown") as string) || "").trim();
  const feeText = ((formData.get("feeText") as string) || "").trim() || null;
  const signerName = ((formData.get("signerName") as string) || "").trim() || null;
  const signerEmail = ((formData.get("signerEmail") as string) || "").trim() || null;

  const existing = await db.engagementLetter.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Letter not found");
  if (existing.status !== "DRAFT") throw new Error("Only drafts can be edited");

  await db.engagementLetter.update({
    where: { id },
    data: { subject, bodyMarkdown, feeText, signerName, signerEmail },
  });

  revalidatePath(`/${tenantSlug}/practice/letters/${id}`);
}

export async function sendLetterAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const existing = await db.engagementLetter.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Letter not found");
  if (existing.status !== "DRAFT") {
    throw new Error("Only drafts can be sent");
  }
  if (!existing.signerEmail) {
    throw new Error("Signer email is required before sending");
  }

  await db.engagementLetter.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      shareToken: existing.shareToken ?? makeShareToken(),
    },
  });

  // TODO: send email via Resend once RESEND_API_KEY is wired

  revalidatePath(`/${tenantSlug}/practice/letters/${id}`);
  revalidatePath(`/${tenantSlug}/practice/letters`);
}

export async function voidLetterAction(formData: FormData): Promise<void> {
  const tenantSlug = formData.get("tenantSlug") as string;
  const auth = await getAuthContext(tenantSlug);
  if (!auth) redirect(`/${tenantSlug}/login`);
  assertRole(auth.role);

  const id = formData.get("id") as string;
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  const existing = await db.engagementLetter.findFirst({
    where: { id, tenantId: auth.tenant.id },
  });
  if (!existing) throw new Error("Letter not found");
  if (existing.status === "VOIDED" || existing.status === "SIGNED") {
    throw new Error("Letter cannot be voided");
  }

  await db.engagementLetter.update({
    where: { id },
    data: { status: "VOIDED", voidedAt: new Date(), voidedReason: reason },
  });

  revalidatePath(`/${tenantSlug}/practice/letters/${id}`);
  revalidatePath(`/${tenantSlug}/practice/letters`);
}

/** Public sign action — no auth, uses shareToken. */
export async function signLetterPublicAction(formData: FormData): Promise<void> {
  const shareToken = formData.get("shareToken") as string;
  const signerName = ((formData.get("signerName") as string) || "").trim();
  const signerEmail = ((formData.get("signerEmail") as string) || "").trim();

  if (!shareToken || !signerName || !signerEmail) {
    throw new Error("Name and email are required to sign");
  }

  const letter = await db.engagementLetter.findUnique({
    where: { shareToken },
  });
  if (!letter) throw new Error("Letter not found");
  if (letter.status !== "SENT") {
    throw new Error("Letter is not available for signing");
  }

  await db.engagementLetter.update({
    where: { id: letter.id },
    data: {
      status: "SIGNED",
      signedAt: new Date(),
      signerName,
      signerEmail,
    },
  });

  redirect(`/sign/${shareToken}/thanks`);
}

/** Cast for filtering in lists */
export type LetterStatusFilter = LetterStatus | "ALL";
