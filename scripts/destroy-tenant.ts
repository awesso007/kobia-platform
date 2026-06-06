/*
 * destroy-tenant.ts - tear down a tenant (DEV ONLY).
 *
 * Drops the tenant_<slug> schema (CASCADE) and removes the registry row.
 * Refuses to run unless NODE_ENV !== "production" AND --yes is passed, to avoid
 * accidental data loss.
 *
 * Usage:
 *   tsx scripts/destroy-tenant.ts --slug acme --yes
 *
 * Requires DIRECT_URL (non-pooled). Does not invent credentials.
 * No em-dashes in copy by project convention (use hyphens).
 */

type Args = { slug: string; yes: boolean };

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--yes") out.yes = true;
  }
  if (!out.slug) fail("Missing --slug. Usage: tsx scripts/destroy-tenant.ts --slug acme --yes");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(out.slug!)) {
    fail(`Invalid slug "${out.slug}".`);
  }
  return out as Args;
}

function fail(msg: string): never {
  console.error(`\n[destroy-tenant] ERROR: ${msg}\n`);
  process.exit(1);
}

function schemaName(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.env.NODE_ENV === "production") {
    fail("Refusing to run in production. This is a dev-only teardown.");
  }
  if (!args.yes) {
    fail("Destructive operation. Re-run with --yes to confirm dropping the schema and registry row.");
  }

  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    fail('DIRECT_URL is not set. Set a non-pooled Neon connection in .env.local first (see CONFLICTS.md).');
  }

  const schema = schemaName(args.slug);
  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({ datasources: { db: { url: directUrl } } });
  try {
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    console.log(`[destroy-tenant] dropped schema ${schema}`);
    try {
      await client.$executeRawUnsafe(`DELETE FROM public.tenant_registry WHERE slug = $1`, args.slug);
      console.log(`[destroy-tenant] removed registry row for ${args.slug}`);
    } catch {
      console.warn("[destroy-tenant] registry table not present yet; skipped row delete.");
    }
  } finally {
    await client.$disconnect();
  }
  console.log(`[destroy-tenant] done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
