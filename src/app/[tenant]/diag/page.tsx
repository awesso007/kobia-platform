/**
 * Diagnostic page — surfaces the actual error so we can debug without
 * needing Vercel runtime logs. Remove before public launch.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DiagPage({ params }: { params: { tenant: string } }) {
  const out: Record<string, unknown> = { params };

  try {
    const a = auth();
    out.clerkUserId = a.userId;
  } catch (e) {
    out.authError = String(e);
  }

  try {
    const cu = await currentUser();
    out.clerkUser = cu
      ? {
          id: cu.id,
          primaryEmail: cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)
            ?.emailAddress,
          firstName: cu.firstName,
        }
      : null;
  } catch (e) {
    out.currentUserError = String(e);
  }

  try {
    const tenant = await db.tenant.findUnique({ where: { slug: params.tenant } });
    out.tenant = tenant
      ? {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          isActive: tenant.isActive,
          onboardingCompleted: tenant.onboardingCompleted,
          onboardingStep: tenant.onboardingStep,
          industry: tenant.industry,
        }
      : null;

    if (tenant) {
      const entities = await db.entity.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true, isActive: true, baseCurrency: true },
      });
      out.entities = entities;

      const a = auth();
      if (a.userId) {
        const user = await db.user.findUnique({ where: { clerkUserId: a.userId } });
        out.dbUser = user
          ? { id: user.id, email: user.email, firstName: user.firstName }
          : null;

        if (user) {
          const memberships = await db.membership.findMany({
            where: { userId: user.id },
            include: { tenant: { select: { slug: true } } },
          });
          out.memberships = memberships.map((m) => ({
            tenantSlug: m.tenant.slug,
            tenantId: m.tenantId,
            role: m.role,
            isActive: m.isActive,
          }));
        }
      }
    }
  } catch (e) {
    out.dbError = String(e);
    if (e instanceof Error) out.dbErrorStack = e.stack;
  }

  return (
    <pre style={{ padding: 24, background: "#fafafa", color: "#111", fontSize: 12 }}>
      {JSON.stringify(out, null, 2)}
    </pre>
  );
}
