"use server";

/*
 * Web form server actions (Sprint 5). Create, update, and delete WebForm rows
 * that power the public /forms/[slug] hosted form. Gated by form:manage (via
 * requirePermission). Slugs are normalized to a URL-safe shape and must be
 * unique within the tenant.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { auditWrite } from "@/lib/crm/audit";

export type WebFormField = {
  fieldName: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  required: boolean;
  options?: string[];
};

export type WebFormInput = {
  name: string;
  slug: string;
  fields: WebFormField[];
  thankYouUrl?: string | null;
  redirectUrl?: string | null;
};

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function cleanFields(fields: WebFormField[]): WebFormField[] {
  return fields
    .filter((f) => f.fieldName?.trim())
    .map((f) => ({
      fieldName: f.fieldName.trim().replace(/[^a-zA-Z0-9_]/g, ""),
      label: f.label?.trim() || f.fieldName.trim(),
      type: (["text", "email", "tel", "textarea", "select"].includes(f.type) ? f.type : "text") as WebFormField["type"],
      required: Boolean(f.required),
      ...(f.options && f.options.length ? { options: f.options.map((o) => o.trim()).filter(Boolean) } : {}),
    }));
}

export async function createWebForm(input: WebFormInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requirePermission("form:manage");
  const name = input.name?.trim();
  const slug = normalizeSlug(input.slug || input.name || "");
  if (!name) return { ok: false, error: "Form name is required." };
  if (!slug) return { ok: false, error: "A valid slug is required." };

  const { db } = getTenantDb();
  const existing = await db.webForm.findUnique({ where: { slug } });
  if (existing) return { ok: false, error: "A form with that slug already exists." };

  const form = await db.webForm.create({
    data: {
      name,
      slug,
      fieldsConfig: cleanFields(input.fields) as never,
      thankYouUrl: input.thankYouUrl?.trim() || null,
      redirectUrl: input.redirectUrl?.trim() || null,
    },
  });
  await auditWrite({ action: "CREATE", entityType: "COMPANY", entityId: form.id, diff: { webForm: name, slug } });
  revalidatePath("/app/settings/forms");
  return { ok: true, id: form.id };
}

export async function updateWebForm(id: string, input: WebFormInput): Promise<{ ok: boolean; error?: string }> {
  await requirePermission("form:manage");
  const name = input.name?.trim();
  const slug = normalizeSlug(input.slug || input.name || "");
  if (!name) return { ok: false, error: "Form name is required." };
  if (!slug) return { ok: false, error: "A valid slug is required." };

  const { db } = getTenantDb();
  const clash = await db.webForm.findUnique({ where: { slug } });
  if (clash && clash.id !== id) return { ok: false, error: "A form with that slug already exists." };

  await db.webForm.update({
    where: { id },
    data: {
      name,
      slug,
      fieldsConfig: cleanFields(input.fields) as never,
      thankYouUrl: input.thankYouUrl?.trim() || null,
      redirectUrl: input.redirectUrl?.trim() || null,
    },
  });
  await auditWrite({ action: "UPDATE", entityType: "COMPANY", entityId: id, diff: { webForm: name, slug } });
  revalidatePath("/app/settings/forms");
  return { ok: true };
}

export async function deleteWebForm(id: string): Promise<{ ok: boolean }> {
  await requirePermission("form:manage");
  const { db } = getTenantDb();
  await db.webForm.delete({ where: { id } });
  await auditWrite({ action: "DELETE", entityType: "COMPANY", entityId: id, diff: { webForm: "deleted" } });
  revalidatePath("/app/settings/forms");
  return { ok: true };
}
