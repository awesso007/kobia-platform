/*
 * Knowledge base logic (Sprint 15). Helpers for KB article publishing, view and
 * feedback counters, and slug generation. Each function takes an explicit db so
 * it serves both the authenticated admin UI and the public /kb reader.
 *
 * Published article counters (viewCount, helpfulCount, notHelpfulCount) are kept
 * denormalized on KbArticle for cheap reads; KbFeedback rows hold the detail. A
 * public view dispatches the KB_ARTICLE_VIEWED automation trigger.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
import { reindex } from "@/lib/search";

type Db = PrismaClient;

/** Slugify a title to a URL-safe, lowercase, hyphenated string. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "article"
  );
}

/** Ensure a slug is unique among KB articles by appending -2, -3, ... */
export async function uniqueArticleSlug(db: Db, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base);
  let candidate = root;
  let n = 1;
  // Bounded loop; slug collisions are rare.
  for (let i = 0; i < 100; i++) {
    const existing = await db.kbArticle.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
    candidate = `${root}-${n}`;
  }
  return `${root}-${Date.now()}`;
}

export type UpsertArticleInput = {
  id?: string;
  title: string;
  bodyHtml: string;
  summary?: string | null;
  categoryId?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  visibility?: "PUBLIC" | "INTERNAL" | "AUTHENTICATED";
  authorId?: string | null;
};

/** Create or update a KB article, managing slug + publishedAt, then reindex. */
export async function upsertArticle(db: Db, input: UpsertArticleInput): Promise<string> {
  const status = input.status ?? "DRAFT";
  if (input.id) {
    const existing = await db.kbArticle.findUnique({ where: { id: input.id } });
    if (!existing) throw new Error("article not found");
    const becomingPublished = status === "PUBLISHED" && existing.status !== "PUBLISHED";
    await db.kbArticle.update({
      where: { id: input.id },
      data: {
        title: input.title,
        bodyHtml: input.bodyHtml,
        summary: input.summary ?? null,
        categoryId: input.categoryId ?? null,
        status: status as never,
        visibility: (input.visibility ?? existing.visibility) as never,
        publishedAt: becomingPublished ? new Date() : existing.publishedAt,
      },
    });
    await reindex(db, "KB_ARTICLE", input.id);
    return input.id;
  }

  const slug = await uniqueArticleSlug(db, input.title);
  const created = await db.kbArticle.create({
    data: {
      slug,
      title: input.title,
      bodyHtml: input.bodyHtml,
      summary: input.summary ?? null,
      categoryId: input.categoryId ?? null,
      status: status as never,
      visibility: (input.visibility ?? "PUBLIC") as never,
      authorId: input.authorId ?? null,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });
  await reindex(db, "KB_ARTICLE", created.id);
  return created.id;
}

/** Increment an article's view counter and dispatch KB_ARTICLE_VIEWED. */
export async function recordArticleView(db: Db, articleId: string): Promise<void> {
  await db.kbArticle.update({ where: { id: articleId }, data: { viewCount: { increment: 1 } } });
  try {
    const { dispatchAutomation } = await import("@/lib/automations/dispatch");
    await dispatchAutomation({ type: "KB_ARTICLE_VIEWED", entityType: "TICKET", entityId: articleId }, db);
  } catch (err) {
    console.error(`[helpdesk] KB_ARTICLE_VIEWED dispatch failed for ${articleId}`, err);
  }
}

/** Record helpful/not-helpful feedback and bump the matching counter. */
export async function recordFeedback(
  db: Db,
  articleId: string,
  helpful: boolean,
  comment?: string | null,
): Promise<boolean> {
  const article = await db.kbArticle.findUnique({ where: { id: articleId } });
  if (!article) return false;
  await db.kbFeedback.create({ data: { articleId, helpful, comment: comment ?? null } });
  await db.kbArticle.update({
    where: { id: articleId },
    data: helpful ? { helpfulCount: { increment: 1 } } : { notHelpfulCount: { increment: 1 } },
  });
  return true;
}
