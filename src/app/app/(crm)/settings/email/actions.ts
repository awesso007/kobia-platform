"use server";

/*
 * Email settings server actions (Sprint 6). CRUD for EmailAccount (SMTP/IMAP),
 * EmailTemplate, and EmailSignature, plus a Test connection action. All gated
 * by email:manage. SMTP/IMAP passwords are encrypted at rest via secrets.ts.
 *
 * OAuth providers (GMAIL_OAUTH / OUTLOOK_OAUTH) are accepted as account types
 * but cannot be connected yet (the Connect flow returns a not-configured note).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { auditWrite } from "@/lib/crm/audit";
import { encrypt, decrypt } from "@/lib/crypto/secrets";

function currentUserId(): string {
  // The tenant header carries the resolved clerk user id in alpha; fall back to
  // a stable owner key so seed/manual flows still attribute rows to someone.
  return headers().get("x-clerk-user-id") ?? "owner";
}

export type AccountInput = {
  id?: string;
  address: string;
  provider: "SMTP_IMAP" | "GMAIL_OAUTH" | "OUTLOOK_OAUTH";
  displayName?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  status?: "ACTIVE" | "PAUSED" | "ERROR";
};

export async function saveAccount(input: AccountInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requirePermission("email:manage");
  const address = input.address?.trim().toLowerCase();
  if (!address) return { ok: false, error: "Email address is required." };

  const { db } = getTenantDb();
  const ownerClerkUserId = currentUserId();

  const base = {
    address,
    provider: input.provider as never,
    displayName: input.displayName?.trim() || null,
    smtpHost: input.smtpHost?.trim() || null,
    smtpPort: input.smtpPort ?? null,
    smtpUser: input.smtpUser?.trim() || null,
    imapHost: input.imapHost?.trim() || null,
    imapPort: input.imapPort ?? null,
    imapUser: input.imapUser?.trim() || null,
    status: (input.status ?? "ACTIVE") as never,
  };

  if (input.id) {
    const data: Record<string, unknown> = { ...base };
    if (input.smtpPass) data.smtpPassEncrypted = encrypt(input.smtpPass);
    if (input.imapPass) data.imapPassEncrypted = encrypt(input.imapPass);
    await db.emailAccount.update({ where: { id: input.id }, data: data as never });
    await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: input.id, diff: { emailAccount: address } });
    revalidatePath("/app/settings/email");
    return { ok: true, id: input.id };
  }

  try {
    const account = await db.emailAccount.create({
      data: {
        ...base,
        ownerClerkUserId,
        smtpPassEncrypted: input.smtpPass ? encrypt(input.smtpPass) : null,
        imapPassEncrypted: input.imapPass ? encrypt(input.imapPass) : null,
      } as never,
    });
    await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: account.id, diff: { emailAccount: address } });
    revalidatePath("/app/settings/email");
    return { ok: true, id: account.id };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    if (msg.includes("Unique constraint")) return { ok: false, error: "You already have an account with that address." };
    return { ok: false, error: msg };
  }
}

export async function deleteAccount(id: string): Promise<{ ok: boolean }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  await db.emailAccount.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id, diff: { emailAccount: id } });
  revalidatePath("/app/settings/email");
  return { ok: true };
}

export async function testConnection(id: string): Promise<{ ok: boolean; smtp?: string; imap?: string; error?: string }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  const account = await db.emailAccount.findUnique({ where: { id } });
  if (!account) return { ok: false, error: "Account not found." };
  if (account.provider !== "SMTP_IMAP") {
    return { ok: false, error: "Test connection is only available for SMTP/IMAP accounts." };
  }

  let smtp = "not tested";
  let imap = "not tested";

  if (account.smtpHost && account.smtpPort) {
    try {
      const transport = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465,
        auth: account.smtpUser ? { user: account.smtpUser, pass: decrypt(account.smtpPassEncrypted ?? "") } : undefined,
      });
      await transport.verify();
      smtp = "ok";
    } catch (err) {
      smtp = `failed: ${String(err instanceof Error ? err.message : err)}`;
    }
  } else {
    smtp = "no host/port";
  }

  if (account.imapHost && account.imapPort) {
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapPort === 993,
      auth: { user: account.imapUser ?? account.address, pass: decrypt(account.imapPassEncrypted ?? "") },
      logger: false,
    });
    try {
      await client.connect();
      await client.logout();
      imap = "ok";
    } catch (err) {
      imap = `failed: ${String(err instanceof Error ? err.message : err)}`;
    }
  } else {
    imap = "no host/port";
  }

  const ok = smtp === "ok" || imap === "ok";
  return { ok, smtp, imap };
}

export type TemplateInput = { id?: string; name: string; subject: string; bodyHtml: string; scope: "PERSONAL" | "TENANT" };

export async function saveTemplate(input: TemplateInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requirePermission("email:manage");
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Template name is required." };
  const { db } = getTenantDb();
  const data = {
    name,
    subject: input.subject ?? "",
    bodyHtml: input.bodyHtml ?? "",
    scope: input.scope as never,
    ownerClerkUserId: input.scope === "PERSONAL" ? currentUserId() : null,
  };
  if (input.id) {
    await db.emailTemplate.update({ where: { id: input.id }, data: data as never });
    revalidatePath("/app/settings/email");
    return { ok: true, id: input.id };
  }
  const tpl = await db.emailTemplate.create({ data: data as never });
  revalidatePath("/app/settings/email");
  return { ok: true, id: tpl.id };
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  await db.emailTemplate.delete({ where: { id } });
  revalidatePath("/app/settings/email");
  return { ok: true };
}

export type SignatureInput = { id?: string; html: string; isDefault: boolean };

export async function saveSignature(input: SignatureInput): Promise<{ ok: boolean; id?: string }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  const ownerClerkUserId = currentUserId();
  if (input.isDefault) {
    await db.emailSignature.updateMany({ where: { ownerClerkUserId }, data: { isDefault: false } });
  }
  if (input.id) {
    await db.emailSignature.update({ where: { id: input.id }, data: { html: input.html, isDefault: input.isDefault } });
    revalidatePath("/app/settings/email");
    return { ok: true, id: input.id };
  }
  const sig = await db.emailSignature.create({
    data: { ownerClerkUserId, html: input.html, isDefault: input.isDefault },
  });
  revalidatePath("/app/settings/email");
  return { ok: true, id: sig.id };
}

export async function deleteSignature(id: string): Promise<{ ok: boolean }> {
  await requirePermission("email:manage");
  const { db } = getTenantDb();
  await db.emailSignature.delete({ where: { id } });
  revalidatePath("/app/settings/email");
  return { ok: true };
}
