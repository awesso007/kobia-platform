/*
 * seed-sites-acme.ts - populate a tenant schema with Sprint 17 sites starter
 * data. Idempotent: the theme is found by name, the site by slug, pages by
 * (siteId, slug), and blocks are only created when the page has none. Re-running
 * does not duplicate rows.
 *
 * Seeds:
 *   - 1 default theme "Modern" (light, indigo accent)
 *   - 1 Site "Acme Marketing" (slug=acme-marketing, published, home page set)
 *   - Home page: HERO, FEATURES (3), TESTIMONIAL, CTA, FAQ (3 items)
 *   - About page (slug=about): TEXT + IMAGE
 *
 * Usage:
 *   tsx scripts/seed-sites-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { DEFAULT_THEME_TOKENS } from "../src/lib/sites/site-utils";
import { defaultBlockData, type SiteBlockTypeName } from "../src/lib/sites/blocks";

function fail(msg: string): never {
  console.error(`\n[seed-sites] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  if (!slug) fail("Missing --slug. Usage: tsx scripts/seed-sites-acme.ts --slug acme");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug!)) fail(`Invalid slug "${slug}".`);
  return slug!;
}

function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function connectionForSchema(schema: string): string {
  const base = process.env.DATABASE_URL;
  if (!base) fail("DATABASE_URL is not set; cannot build a tenant connection.");
  const url = new URL(base!);
  url.searchParams.set("schema", schema);
  return url.toString();
}

async function ensureTheme(db: PrismaClient): Promise<string> {
  const existing = await db.siteTheme.findFirst({ where: { name: "Modern" } });
  if (existing) return existing.id;
  const created = await db.siteTheme.create({
    data: { name: "Modern", isDefault: true, tokens: DEFAULT_THEME_TOKENS as never },
  });
  return created.id;
}

async function ensurePageBlocks(
  db: PrismaClient,
  pageId: string,
  specs: { type: SiteBlockTypeName; data?: Record<string, unknown> }[],
): Promise<number> {
  const count = await db.siteBlock.count({ where: { pageId } });
  if (count > 0) return 0;
  let order = 0;
  for (const spec of specs) {
    await db.siteBlock.create({
      data: {
        pageId,
        type: spec.type as never,
        order: order++,
        data: (spec.data ?? defaultBlockData(spec.type)) as never,
      },
    });
  }
  return specs.length;
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });

  let blocksCreated = 0;
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);
    console.log(`[seed-sites] search_path=${schema}`);

    const themeId = await ensureTheme(db);
    console.log(`[seed-sites] theme Modern -> ${themeId}`);

    // Site
    let site = await db.site.findUnique({ where: { slug: "acme-marketing" } });
    if (!site) {
      site = await db.site.create({
        data: {
          name: "Acme Marketing",
          slug: "acme-marketing",
          description: "The Acme marketing site.",
          published: true,
          themeId,
          theme: DEFAULT_THEME_TOKENS as never,
        },
      });
    }
    console.log(`[seed-sites] site -> ${site.id}`);

    // Home page
    let home = await db.sitePage.findUnique({ where: { siteId_slug: { siteId: site.id, slug: "home" } } });
    if (!home) {
      home = await db.sitePage.create({ data: { siteId: site.id, slug: "home", title: "Home", order: 0, published: true } });
    } else if (!home.published) {
      home = await db.sitePage.update({ where: { id: home.id }, data: { published: true } });
    }

    // About page
    let about = await db.sitePage.findUnique({ where: { siteId_slug: { siteId: site.id, slug: "about" } } });
    if (!about) {
      about = await db.sitePage.create({ data: { siteId: site.id, slug: "about", title: "About", order: 1, published: true } });
    } else if (!about.published) {
      about = await db.sitePage.update({ where: { id: about.id }, data: { published: true } });
    }

    // Point home pointer at the home page.
    if (site.homePageId !== home.id) {
      await db.site.update({ where: { id: site.id }, data: { homePageId: home.id } });
    }

    // Home blocks: HERO, FEATURES(3), TESTIMONIAL, CTA, FAQ(3)
    blocksCreated += await ensurePageBlocks(db, home.id, [
      { type: "HERO", data: { title: "Welcome to Acme", subtitle: "The all-in-one platform to grow your business.", buttonLabel: "Get started", buttonHref: "/s/acme-marketing/about" } },
      {
        type: "FEATURES",
        data: {
          title: "Why teams choose Acme",
          features: [
            { title: "Fast", body: "Launch in minutes with sensible defaults." },
            { title: "Reliable", body: "Built on infrastructure you can trust." },
            { title: "Secure", body: "Your data is encrypted and isolated per tenant." },
          ],
        },
      },
      { type: "TESTIMONIAL", data: { quote: "Acme transformed how our team works together.", author: "Jordan Lee", role: "COO, Northwind" } },
      { type: "CTA", data: { title: "Ready to get started?", subtitle: "Join thousands of teams already using Acme.", buttonLabel: "Contact sales", buttonHref: "/s/acme-marketing/about" } },
      {
        type: "FAQ",
        data: {
          title: "Frequently asked questions",
          items: [
            { question: "How does pricing work?", answer: "Simple per-seat pricing with a free trial." },
            { question: "Can I import my data?", answer: "Yes, import from CSV or our API." },
            { question: "Do you offer support?", answer: "Every plan includes email support." },
          ],
        },
      },
    ]);

    // About blocks: TEXT + IMAGE
    blocksCreated += await ensurePageBlocks(db, about.id, [
      { type: "TEXT", data: { body: "Acme was founded to help small teams do more with less. We build practical tools that get out of your way.", align: "left" } },
      { type: "IMAGE", data: { url: "https://placehold.co/1080x480?text=Acme", alt: "Acme team", caption: "Our team at work." } },
    ]);

    // Report counts.
    const [siteCount, pageCount, blockCount] = await Promise.all([
      db.site.count(),
      db.sitePage.count({ where: { siteId: site.id } }),
      db.siteBlock.count({ where: { page: { siteId: site.id } } }),
    ]);
    console.log(`[seed-sites] done. sites=${siteCount} pages(this site)=${pageCount} blocks(this site)=${blockCount} blocksCreatedThisRun=${blocksCreated}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-sites] FAILED:", err);
  process.exit(1);
});
