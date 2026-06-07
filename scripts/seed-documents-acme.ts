/*
 * seed-documents-acme.ts - populate a tenant schema with Sprint 14 documents
 * starter data. Idempotent: finds folders by path, documents by name+folder,
 * the envelope by name, and the share link by document, so re-running does not
 * duplicate rows. After seeding it reindexes the folders and documents for
 * search.
 *
 * Seeds:
 *   - 3 DocFolders: /Contracts, /Templates, /Contracts/2026
 *   - 2 Documents:
 *       DOC  "Welcome Letter" (bodyHtml "<p>Welcome to Kobia</p>") in /Templates
 *       FILE "Sample.pdf" (application/pdf) in /Contracts/2026
 *   - 1 DRAFT Envelope "NDA - Acme Corp" wrapping Sample.pdf, with 1 signer
 *       (John Test <john@test.com>, order 0)
 *   - 1 DocumentShareLink for Sample.pdf (no password, download allowed)
 *
 * Usage:
 *   tsx scripts/seed-documents-acme.ts --slug acme
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PrismaClient } from "../src/lib/db/generated/tenant";
import { computePath, createShareLink } from "../src/lib/documents/documents";
import { createEnvelope } from "../src/lib/documents/envelopes";
import { reindex } from "../src/lib/search";

function fail(msg: string): never {
  console.error(`\n[seed-documents] ERROR: ${msg}\n`);
  process.exit(1);
}

function parseSlug(argv: string[]): string {
  let slug: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug") slug = argv[++i];
  }
  if (!slug) fail("Missing --slug. Usage: tsx scripts/seed-documents-acme.ts --slug acme");
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

async function findOrCreateFolder(
  db: PrismaClient,
  name: string,
  parentId: string | null,
): Promise<{ id: string; path: string }> {
  const path = await computePath(db, name, parentId);
  const existing = await db.docFolder.findFirst({ where: { path } });
  if (existing) return { id: existing.id, path: existing.path };
  const created = await db.docFolder.create({ data: { name, parentId, path } });
  return { id: created.id, path: created.path };
}

async function main() {
  const slug = parseSlug(process.argv.slice(2));
  const schema = schemaNameForSlug(slug);
  console.log(`[seed-documents] seeding tenant "${slug}" -> schema "${schema}"`);

  const db = new PrismaClient({ datasources: { db: { url: connectionForSchema(schema) } } });
  try {
    await db.$executeRawUnsafe(`SET search_path TO "${schema}"`);

    // 1. Folders: /Contracts, /Templates, /Contracts/2026
    const contracts = await findOrCreateFolder(db, "Contracts", null);
    const templates = await findOrCreateFolder(db, "Templates", null);
    const contracts2026 = await findOrCreateFolder(db, "2026", contracts.id);

    // 2a. DOC "Welcome Letter" in /Templates
    let welcome = await db.document.findFirst({ where: { name: "Welcome Letter", folderId: templates.id } });
    if (!welcome) {
      welcome = await db.document.create({
        data: {
          name: "Welcome Letter",
          folderId: templates.id,
          kind: "DOC",
          bodyHtml: "<p>Welcome to Kobia</p>",
        },
      });
    }

    // 2b. FILE "Sample.pdf" in /Contracts/2026
    let sample = await db.document.findFirst({ where: { name: "Sample.pdf", folderId: contracts2026.id } });
    if (!sample) {
      sample = await db.document.create({
        data: {
          name: "Sample.pdf",
          folderId: contracts2026.id,
          kind: "FILE",
          mimeType: "application/pdf",
          sizeBytes: 0,
          storageKey: "seed/sample.pdf",
        },
      });
    }

    // 3. DRAFT envelope "NDA - Acme Corp" wrapping Sample.pdf, 1 signer.
    let envelope = await db.envelope.findFirst({ where: { name: "NDA - Acme Corp" } });
    if (!envelope) {
      const envelopeId = await createEnvelope(db, {
        name: "NDA - Acme Corp",
        documentId: sample.id,
        message: "Please review and sign the attached NDA.",
        signers: [{ name: "John Test", email: "john@test.com", order: 0 }],
      });
      envelope = await db.envelope.findUnique({ where: { id: envelopeId } });
    }

    // 4. Share link for Sample.pdf (no password, download allowed).
    let shareLink = await db.documentShareLink.findFirst({ where: { documentId: sample.id } });
    if (!shareLink) {
      const created = await createShareLink(db, { documentId: sample.id, allowDownload: true });
      shareLink = await db.documentShareLink.findUnique({ where: { id: created.id } });
    }

    // Reindex folders and documents for search.
    for (const f of [contracts, templates, contracts2026]) {
      await reindex(db, "DOC_FOLDER", f.id);
    }
    await reindex(db, "DOCUMENT", welcome.id);
    await reindex(db, "DOCUMENT", sample.id);

    const [folders, documents, envelopes, signers, shareLinks] = await Promise.all([
      db.docFolder.count(),
      db.document.count(),
      db.envelope.count(),
      db.envelopeSigner.count(),
      db.documentShareLink.count(),
    ]);

    console.log(
      `[seed-documents] done. ids -> contracts=${contracts.id} templates=${templates.id} contracts2026=${contracts2026.id} welcome=${welcome.id} sample=${sample.id} envelope=${envelope?.id} shareLink=${shareLink?.id} (token=${shareLink?.token})`,
    );
    console.log(
      `[seed-documents] counts -> folders=${folders} documents=${documents} envelopes=${envelopes} signers=${signers} shareLinks=${shareLinks}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed-documents] failed", err);
  process.exit(1);
});
