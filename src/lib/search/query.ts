/*
 * Search query (Sprint 9). Runs the ranked full-text query against the per-tenant
 * SearchIndex.tsv generated column using websearch_to_tsquery + ts_rank_cd. Top 5
 * per entity group. Called from the POST /api/search route handler only (the
 * palette is server-rendered; no Postgres in client components).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

export type SearchHit = {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  rank: number;
};

export type SearchGroup = {
  entityType: string;
  hits: SearchHit[];
};

const GROUP_ORDER = [
  "LEAD",
  "DEAL",
  "CONTACT",
  "COMPANY",
  "ACTIVITY",
  "FILE",
  "EMAIL_MESSAGE",
  "NOTE",
] as const;

type Row = {
  entityType: string;
  entityId: string;
  title: string;
  subtitle: string | null;
  rank: number;
};

/**
 * Ranked search across all indexed entities. Returns up to 5 hits per group,
 * groups ordered by GROUP_ORDER. Uses a window function so the per-group limit
 * is enforced in a single query.
 */
export async function search(db: PrismaClient, q: string): Promise<SearchGroup[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];

  const rows = await db.$queryRaw<Row[]>`
    SELECT "entityType", "entityId", "title", "subtitle", rank
    FROM (
      SELECT
        "entityType"::text AS "entityType",
        "entityId",
        "title",
        "subtitle",
        ts_rank_cd("tsv", websearch_to_tsquery('english', ${trimmed})) AS rank,
        row_number() OVER (
          PARTITION BY "entityType"
          ORDER BY ts_rank_cd("tsv", websearch_to_tsquery('english', ${trimmed})) DESC
        ) AS rn
      FROM "SearchIndex"
      WHERE "tsv" @@ websearch_to_tsquery('english', ${trimmed})
    ) ranked
    WHERE rn <= 5
    ORDER BY rank DESC
  `;

  const byType = new Map<string, SearchHit[]>();
  for (const r of rows) {
    const hit: SearchHit = {
      entityType: r.entityType,
      entityId: r.entityId,
      title: r.title,
      subtitle: r.subtitle,
      rank: Number(r.rank),
    };
    const arr = byType.get(r.entityType);
    if (arr) arr.push(hit);
    else byType.set(r.entityType, [hit]);
  }

  const groups: SearchGroup[] = [];
  for (const t of GROUP_ORDER) {
    const hits = byType.get(t);
    if (hits && hits.length) groups.push({ entityType: t, hits });
  }
  return groups;
}
