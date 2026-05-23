/**
 * PUBLIC diagnostic — no auth required. Mirrors the [tenant]/diag steps
 * EXCEPT the ones that need a Clerk user. Surfaces DB / config errors.
 * DELETE before public launch. Listed as a public route in middleware.ts.
 */
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getActiveEntity, listEntitiesForSwitcher } from "@/lib/active-entity";
import { getActiveModule } from "@/lib/active-module";
import { getModuleByKey } from "@/lib/modules-config";

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

export default async function DebugDiag({ params }: { params: { tenant: string } }) {
  const steps: Step[] = [];

  steps.push(await run("params", () => params));

  steps.push(
    await run("env", () => ({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
      hasDB: !!process.env.DATABASE_URL,
      hasClerkSecret: !!process.env.CLERK_SECRET_KEY,
      hasClerkPub: !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    })),
  );

  steps.push(
    await run("headers()", () => {
      const h = headers();
      return { xPathname: h.get("x-pathname"), host: h.get("host") };
    }),
  );

  steps.push(
    await run("db.$queryRaw select 1", async () => {
      const r = await db.$queryRaw`SELECT 1 as ok`;
      return r;
    }),
  );

  let tenantRow: { id: string; slug: string; isActive: boolean; onboardingCompleted: boolean; primaryColor: string | null } | null = null;
  steps.push(
    await run("db.tenant.findUnique", async () => {
      const t = await db.tenant.findUnique({ where: { slug: params.tenant } });
      if (t) {
        tenantRow = {
          id: t.id,
          slug: t.slug,
          isActive: t.isActive,
          onboardingCompleted: t.onboardingCompleted,
          primaryColor: t.primaryColor,
        };
      }
      return tenantRow;
    }),
  );

  if (tenantRow) {
    const t = tenantRow as { id: string; slug: string };

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
      await run("getModuleByKey('accounting')", () => {
        const m = getModuleByKey("accounting");
        return {
          key: m?.key,
          label: m?.label,
          topTabsCount: m?.topTabs?.length,
        };
      }),
    );
  }

  // counts
  steps.push(
    await run("model counts", async () => {
      const [users, memberships, entities, tenants] = await Promise.all([
        db.user.count(),
        db.membership.count(),
        db.entity.count(),
        db.tenant.count(),
      ]);
      return { users, memberships, entities, tenants };
    }),
  );

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>KOBIA Public Debug Diag</h1>
      <p style={{ fontSize: 12, color: "#666" }}>
        No auth required. Tenant slug: <code>{params.tenant}</code>
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
                {s.ok ? "OK" : "ERR"}
              </td>
              <td style={{ padding: 6, border: "1px solid #ddd", verticalAlign: "top" }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 11 }}>
                  {s.ok
                    ? JSON.stringify(
                        s.result,
                        (_k, v) => (typeof v === "bigint" ? v.toString() : v),
                        2,
                      )
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
