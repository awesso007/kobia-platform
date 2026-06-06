"use server";

/*
 * Onboarding server action (Sprint 5). Provisions a brand new tenant for the
 * signed-in user: schema + migrations + registry row + OWNER Membership + a
 * default pipeline with stages, then sets the kb-tenant cookie so the CRM shell
 * resolves the new workspace. Returns the slug; the client redirects to
 * /app/deals on success.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { provisionTenant, ProvisionError } from "@/lib/tenancy/provision";

export type OnboardingResult = { ok: true; slug: string } | { ok: false; error: string };

export async function createWorkspace(input: { slug: string; companyName: string }): Promise<OnboardingResult> {
  let clerkUserId: string | null = null;
  let email: string | null = null;
  let displayName: string | null = null;
  try {
    clerkUserId = auth().userId ?? null;
    if (clerkUserId) {
      const u = await currentUser();
      email = u?.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? null;
      displayName = [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.username || null;
    }
  } catch {
    clerkUserId = null;
  }

  if (!clerkUserId) return { ok: false, error: "You must be signed in to create a workspace." };

  const companyName = input.companyName?.trim();
  if (!companyName) return { ok: false, error: "Company name is required." };

  try {
    const { slug } = await provisionTenant({
      slug: input.slug,
      companyName,
      owner: { clerkUserId, email, displayName },
    });
    cookies().set("kb-tenant", slug, { path: "/", sameSite: "lax" });
    return { ok: true, slug };
  } catch (err) {
    if (err instanceof ProvisionError) return { ok: false, error: err.message };
    console.error("[onboarding] provision failed", err);
    return { ok: false, error: "Could not create the workspace. Please try again." };
  }
}
