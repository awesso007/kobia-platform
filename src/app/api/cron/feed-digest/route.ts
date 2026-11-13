/*
 * Cron: feed digest (Sprint 21). For every ACTIVE tenant, logs the top 5 feed
 * posts of the last 24h (ranked by reactions + comments + views). No email yet;
 * this is the scaffold a future digest mailer will build on. Mirrors the other
 * per-tenant crons with per-tenant error isolation.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse } from "next/server";
import { requireKobiaCronAuth } from "@/lib/security/cron-authorization";
import { getTenantPrisma } from "@/lib/db/tenant-prisma";
import { activeWebhookTenantSchema } from "@/lib/security/legacy-webhook-tenant";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Authentication must precede tenant enumeration and all side effects.
  const denied = requireKobiaCronAuth(req);
  if (denied) return denied;
  try {
    const { PrismaClient } = await import("@/lib/db/generated/platform");
    const platform = new PrismaClient();
    let tenants: { slug: string; schemaName: string }[] = [];
    try {
      tenants = await platform.tenantRegistry.findMany({
        where: { status: "ACTIVE" },
        select: { slug: true, schemaName: true },
      });
    } finally {
      await platform.$disconnect();
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const results: { tenant: string; top: number; error?: string }[] = [];
    for (const t of tenants) {
      try {
        // Never let a stale platform row route a worker into a foreign schema.
        const schema = await activeWebhookTenantSchema(t.slug);
        if (!schema || schema !== t.schemaName) continue;
        const db = getTenantPrisma(schema);
        const posts = await db.feedPost.findMany({
          where: { deletedAt: null, createdAt: { gte: since } },
          orderBy: [{ reactionCount: "desc" }, { commentCount: "desc" }, { viewCount: "desc" }],
          take: 5,
          select: { id: true, title: true, body: true, reactionCount: true, commentCount: true, viewCount: true },
        });
        if (posts.length > 0) {
          console.log(`[cron/feed-digest] ${t.slug}: top ${posts.length} posts (last 24h)`);
          for (const p of posts) {
            const label = (p.title ?? p.body).replace(/\s+/g, " ").slice(0, 60);
            console.log(`  - ${label} (${p.reactionCount} reactions, ${p.commentCount} comments, ${p.viewCount} views)`);
          }
        }
        results.push({ tenant: t.slug, top: posts.length });
      } catch (err) {
        results.push({ tenant: t.slug, top: 0, error: String(err instanceof Error ? err.message : err) });
      }
    }

    return NextResponse.json({ ok: true, tenants: results });
  } catch (err) {
    console.error("[cron/feed-digest] failed", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
