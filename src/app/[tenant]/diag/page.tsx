/**
 * Diagnostic page — bulletproof. Each block isolated; nothing can crash the
 * page. Surfaces the real error message so we don't need Vercel runtime logs.
 * DELETE before public launch.
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { ensureMembership } from "@/lib/ensure-membership";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule } from "@/lib/active-module";

export const dynamic = "force-dynamic";

type Step = { name: string; ok: boolean; result?: unknown; error?: string; stack?: string };

async function run<T>(name: string, fn: () => T | Promise<T>): Promise<Step> {
  try {
    const result = await fn();
    return { name, ok: true, result };
  } catch (err) {
    const e = err as Error;
    return { name, ok: false, error: `${e?.name}: ${e?.message}`, stack: e?.stack };
  }
}

export default async function DiagPage({ params }: { params: { tenant: string } }) {
  const steps: Step[] = [];

  steps.push(await run("params", () => params));

  steps.push(
    await run("auth()", () => {
      const a = auth();
      return { userId: a.userId, sessionId: a.sessionId };
    }),
  );

  steps.push(
    await run("currentUser()", async () => {
      const u = await currentUser();
      if (!u) return null;
      return {
        id: u.id,
        primaryEmail: u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress,
        firstName: u.firstName,
        lastName: u.lastName,
      };
    }),
  );

  steps.push(
    await run("headers()", () => {
      const h = headers();
      return { xPathname: h.get("x-pathname"), host: h.get("host") };
    }),
  );

  let tenantRow: { id: string; slug: string; isActive: boolean; onboardingCompleted: boolean } | null = null;
  steps.push(
    await run("db.tenant.findUnique", async () => {
      const t = await db.tenant.findUnique({ where: { slug: params.tenant } });
      if (t) {
        tenantRow = {
          id: t.id,
          slug: t.slug,
          isActive: t.isActive,
          onboardingCompleted: t.onboardingCompleted,
        };
      }
      return tenantRow;
    }),
  );

  if (tenantRow) {
    const t = tenantRow as { id: string; slug: string; isActive: boolean; onboardingCompleted: boolean };

    steps.push(
      await run("ensureMembership", async () => {
        const r = await ensureMembership(t.slug);
        return r;
      }),
    );

    steps.push(
      await run("listEntitiesForSwitcher", async () => {
        const r = await listEntitiesForSwitcher(t.id);
        return { count: r.length, first: r[0] ?? null };
      }),
    );

    steps.push(
      await run("getActiveEntity", async () => {
        const r = await getActiveEntity({ tenantId: t.id, tenantSlug: t.slug });
        return r ? { id: r.id, name: r.name } : null;
      }),
    );

    steps.push(
      await run("getActiveModule", async () => {
        const r = await getActiveModule(t.slug);
        return r;
      }),
    );

    steps.push(
      await run("db.user.findUnique(clerk)", async () => {
        const a = auth();
        if (!a.userId) return { skipped: "no clerk userId" };
        const u = await db.user.findUnique({ where: { clerkUserId: a.userId } });
        return u ? { id: u.id, email: u.email } : null;
      }),
    );

    steps.push(
      await run("memberships", async () => {
        const a = auth();
        if (!a.userId) return { skipped: "no clerk userId" };
        const u = await db.user.findUnique({ where: { clerkUserId: a.userId } });
        if (!u) return { skipped: "no db user" };
        const ms = await db.membership.findMany({
          where: { userId: u.id },
          include: { tenant: { select: { slug: true } } },
        });
        return ms.map((m) => ({
          tenantSlug: m.tenant.slug,
          role: m.role,
          isActive: m.isActive,
        }));
      }),
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>KOBIA Diag — bulletproof</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        Each block runs in isolation. ok=false rows show the real error.
      </p>
      <table style={{ marginTop: 16, fontSize: 12, borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f3f4f6", textAlign: "left" }}>
            <th style={{ padding: 6, border: "1px solid #ddd" }}>Step</th>
            <th style={{ padding: 6, border: "1px solid #ddd" }}>OK</th>
            <th style={{ padding: 6, border: "1px solid #ddd" }}>Result / Error</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} style={{ background: s.ok ? "white" : "#fff1f2" }}>
              <td style={{ padding: 6, border: "1px solid #ddd", verticalAlign: "top" }}>
                {s.name}
              </td>
              <td style={{ padding: 6, border: "1px solid #ddd", verticalAlign: "top" }}>
                {s.ok ? "✓" : "✗"}
              </td>
              <td style={{ padding: 6, border: "1px solid #ddd", verticalAlign: "top" }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11 }}>
                  {s.ok
                    ? JSON.stringify(s.result, null, 2)
                    : `${s.error}\n\n${s.stack ?? ""}`}
                </pre>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
