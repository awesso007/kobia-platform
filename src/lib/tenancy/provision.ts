/*
 * provision.ts - runtime tenant provisioning (Sprint 5).
 *
 * Refactors the core of scripts/provision-tenant.ts into a library callable
 * from a server action (the onboarding flow). It:
 *   1. Creates the Postgres schema tenant_<slug> (idempotent DDL).
 *   2. Applies the tenant migration SQL files in order against that schema.
 *   3. Upserts the public.tenant_registry row.
 *   4. Seeds a default pipeline + 5 stages and an OWNER Membership.
 *
 * Unlike the CLI script it does NOT shell out to `prisma migrate deploy`
 * (there is no CLI on Vercel serverless). Instead it runs each migration's SQL
 * directly. This needs DIRECT_URL (non-pooled) for DDL; if DIRECT_URL is unset
 * it throws a clear error - we never invent credentials.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export class ProvisionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProvisionError";
  }
}

export function schemaNameForSlug(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

function directUrl(): string {
  const url = process.env.DIRECT_URL;
  if (!url) {
    throw new ProvisionError("DIRECT_URL is not set; tenant provisioning needs a non-pooled connection for DDL.");
  }
  return url;
}

function withSchema(connStr: string, schema: string): string {
  const u = new URL(connStr);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** Split a migration file into individual statements on semicolons at line ends. */
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
}

async function applyTenantMigrations(schema: string): Promise<void> {
  const { PrismaClient } = await import("@/lib/db/generated/tenant");
  const client = new PrismaClient({ datasources: { db: { url: withSchema(directUrl(), schema) } } });
  try {
    const migrationsDir = path.join(process.cwd(), "prisma", "tenant", "migrations");
    const entries = (await readdir(migrationsDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const dir of entries) {
      const file = path.join(migrationsDir, dir, "migration.sql");
      let sql: string;
      try {
        sql = await readFile(file, "utf8");
      } catch {
        continue;
      }
      for (const stmt of splitStatements(sql)) {
        await client.$executeRawUnsafe(stmt);
      }
    }
  } finally {
    await client.$disconnect();
  }
}

async function createSchema(schema: string): Promise<void> {
  const { PrismaClient } = await import("@/lib/db/generated/platform");
  const client = new PrismaClient({ datasources: { db: { url: directUrl() } } });
  try {
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await client.$disconnect();
  }
}

async function upsertRegistry(slug: string, schema: string, companyName: string, ownerEmail: string | null): Promise<void> {
  const { PrismaClient } = await import("@/lib/db/generated/platform");
  const client = new PrismaClient({ datasources: { db: { url: directUrl() } } });
  try {
    await client.tenantRegistry.upsert({
      where: { slug },
      create: { slug, schemaName: schema, status: "ACTIVE", plan: "FREE", displayName: companyName, billingEmail: ownerEmail },
      update: { schemaName: schema, displayName: companyName },
    });
  } finally {
    await client.$disconnect();
  }
}

const STAGES = [
  { name: "New", sortOrder: 0, isWon: false, isLost: false },
  { name: "Qualified", sortOrder: 1, isWon: false, isLost: false },
  { name: "Proposal", sortOrder: 2, isWon: false, isLost: false },
  { name: "Won", sortOrder: 3, isWon: true, isLost: false },
  { name: "Lost", sortOrder: 4, isWon: false, isLost: true },
];

async function seedTenant(schema: string, owner: { clerkUserId: string; email: string | null; displayName: string | null }): Promise<void> {
  const { PrismaClient } = await import("@/lib/db/generated/tenant");
  const client = new PrismaClient({ datasources: { db: { url: withSchema(directUrl(), schema) } } });
  try {
    const pipeline = await client.pipeline.upsert({
      where: { name: "Default Sales Pipeline" },
      create: { name: "Default Sales Pipeline", isDefault: true },
      update: { isDefault: true },
    });
    for (const s of STAGES) {
      const existing = await client.dealStage.findFirst({ where: { pipelineId: pipeline.id, name: s.name } });
      if (!existing) await client.dealStage.create({ data: { ...s, pipelineId: pipeline.id } });
    }
    await client.membership.upsert({
      where: { clerkUserId: owner.clerkUserId },
      create: { clerkUserId: owner.clerkUserId, role: "OWNER", status: "ACTIVE", email: owner.email, displayName: owner.displayName },
      update: { role: "OWNER", status: "ACTIVE" },
    });
  } finally {
    await client.$disconnect();
  }
}

export type ProvisionInput = {
  slug: string;
  companyName: string;
  owner: { clerkUserId: string; email: string | null; displayName: string | null };
};

/** Provision a brand new tenant end to end. Idempotent where practical. */
export async function provisionTenant(input: ProvisionInput): Promise<{ slug: string; schema: string }> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new ProvisionError(`Invalid workspace slug "${slug}". Use lowercase letters, digits, and hyphens.`);
  }
  const schema = schemaNameForSlug(slug);

  // Reject if the slug is already taken by another tenant.
  const { PrismaClient } = await import("@/lib/db/generated/platform");
  const platform = new PrismaClient({ datasources: { db: { url: directUrl() } } });
  try {
    const existing = await platform.tenantRegistry.findUnique({ where: { slug } });
    if (existing) throw new ProvisionError(`The workspace "${slug}" is already taken. Choose another.`);
  } finally {
    await platform.$disconnect();
  }

  await createSchema(schema);
  await applyTenantMigrations(schema);
  await upsertRegistry(slug, schema, input.companyName.trim(), input.owner.email);
  await seedTenant(schema, input.owner);
  return { slug, schema };
}
