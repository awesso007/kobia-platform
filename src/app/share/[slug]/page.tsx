/*
 * Public share-link landing page (Sprint 8). Unauthenticated. Resolves the
 * tenant from a validated `?t=<slug>` query param, loads the FileShareLink by
 * [slug], and shows the file name + size with a Download button. If the link is
 * password protected the client prompts for it; the actual byte serving and all
 * validation (expiry, max downloads, password) happen in /api/share/[slug].
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantPrisma, schemaNameForSlug } from "@/lib/db/tenant-prisma";
import { ShareClient } from "./ShareClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default async function PublicSharePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const tParam = Array.isArray(searchParams.t) ? searchParams.t[0] : searchParams.t;
  const tenantSlug = sanitizeSlug(tParam);

  const unavailable = (
    <Shell>
      <p style={{ color: "var(--kb-text-secondary)" }}>This link is no longer available.</p>
    </Shell>
  );

  if (!tenantSlug) return unavailable;

  let link:
    | { hasPassword: boolean; expired: boolean; overLimit: boolean; fileName: string; size: number }
    | null = null;
  try {
    const db = getTenantPrisma(schemaNameForSlug(tenantSlug));
    const row = await db.fileShareLink.findUnique({
      where: { slug: params.slug },
      include: { file: true },
    });
    if (row && row.file && row.file.status !== "DELETED") {
      link = {
        hasPassword: Boolean(row.password),
        expired: Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now()),
        overLimit: row.maxDownloads !== null && row.downloadCount >= row.maxDownloads,
        fileName: row.file.name,
        size: Number(row.file.size),
      };
    }
  } catch {
    link = null;
  }

  if (!link) return unavailable;
  if (link.expired)
    return (
      <Shell>
        <p style={{ color: "var(--kb-text-secondary)" }}>This link has expired.</p>
      </Shell>
    );
  if (link.overLimit)
    return (
      <Shell>
        <p style={{ color: "var(--kb-text-secondary)" }}>This link has reached its download limit.</p>
      </Shell>
    );

  return (
    <Shell>
      <ShareClient
        tenantSlug={tenantSlug}
        shareSlug={params.slug}
        fileName={link.fileName}
        size={link.size}
        hasPassword={link.hasPassword}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kobia-crm min-h-screen w-full"
      style={{ backgroundColor: "var(--kb-surface-grey)", padding: "48px 16px" }}
    >
      <div
        className="mx-auto rounded p-6"
        style={{
          maxWidth: "440px",
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
