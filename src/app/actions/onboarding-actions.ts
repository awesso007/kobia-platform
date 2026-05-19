"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getTenantBySlug } from "@/lib/tenant";
import { provisionEntity } from "@/lib/accounting/provision-entity";
import { SUPPORTED_INDUSTRIES } from "@/lib/accounting/chart-of-accounts-templates";
import { clerkClient } from "@clerk/nextjs/server";

/** Step 1: pick industry, advance to entity step. */
export async function setTenantIndustry(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const industryRaw = String(formData.get("industry") ?? "");
  const industry = industryRaw === "GENERIC" ? null : industryRaw || null;

  if (industry && !SUPPORTED_INDUSTRIES.includes(industry)) {
    throw new Error(`Unsupported industry: ${industry}`);
  }

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");

  await db.tenant.update({
    where: { id: tenant.id },
    data: {
      industry,
      onboardingStep: "entity",
    },
  });

  revalidatePath(`/${slug}/welcome`);
  redirect(`/${slug}/welcome?step=entity`);
}

/** Step 2: create the first entity (seeds COA from chosen industry). */
export async function createFirstEntity(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const fiscalYearEnd = String(formData.get("fiscalYearEnd") ?? "12-31");
  const baseCurrency = String(formData.get("baseCurrency") ?? "USD");

  if (!name) throw new Error("Entity name is required");

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");

  // Re-check: do not create duplicate first entity if one already exists.
  const existing = await db.entity.count({ where: { tenantId: tenant.id } });
  if (existing === 0) {
    await provisionEntity({
      tenantId: tenant.id,
      name,
      legalName: tenant.legalName ?? undefined,
      industry: tenant.industry ?? undefined,
      fiscalYearEnd,
      baseCurrency,
    });
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { onboardingStep: "team" },
  });

  revalidatePath(`/${slug}/welcome`);
  redirect(`/${slug}/welcome?step=team`);
}

/** Step 3: optional team invite — for now stores intent; full invite UX comes later. */
export async function inviteTeamMember(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");

  if (email) {
    try {
      // Best-effort: create a Clerk invitation. Failures don't block onboarding.
      const client = await clerkClient();
      await client.invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { tenantId: tenant.id, tenantSlug: tenant.slug, role: "MEMBER" },
        redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://kobia-platform.vercel.app"}/${tenant.slug}/dashboard`,
      });
    } catch (err) {
      console.warn("[onboarding] invite failed (non-blocking):", err);
    }
  }

  revalidatePath(`/${slug}/welcome`);
  redirect(`/${slug}/welcome?step=done`);
}

/** Final step: mark onboarding complete, send user to dashboard. */
export async function completeOnboarding(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");

  await db.tenant.update({
    where: { id: tenant.id },
    data: { onboardingCompleted: true, onboardingStep: "done" },
  });

  revalidatePath(`/${slug}`);
  redirect(`/${slug}/dashboard`);
}

/** Escape hatch: skip everything and go straight to dashboard. */
export async function skipOnboarding(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const tenant = await getTenantBySlug(slug);
  if (!tenant) throw new Error("Tenant not found");

  // Ensure at least one entity exists so /books works.
  const existing = await db.entity.count({ where: { tenantId: tenant.id } });
  if (existing === 0) {
    await provisionEntity({
      tenantId: tenant.id,
      name: tenant.name,
      legalName: tenant.legalName ?? undefined,
      industry: tenant.industry ?? undefined,
      fiscalYearEnd: "12-31",
      baseCurrency: "USD",
    });
  }

  await db.tenant.update({
    where: { id: tenant.id },
    data: { onboardingCompleted: true, onboardingStep: "done" },
  });

  revalidatePath(`/${slug}`);
  redirect(`/${slug}/dashboard`);
}
