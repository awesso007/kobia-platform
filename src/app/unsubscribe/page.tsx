/*
 * Public unsubscribe page (Sprint 13). Unauthenticated. Prefills email + tenant
 * from `?email=` and `?t=<slug>` (the values broadcast links carry), lets the
 * recipient confirm, and POSTs to /api/unsubscribe. Tenant is resolved from the
 * validated slug, not the session.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { UnsubscribeClient } from "./UnsubscribeClient";

export const dynamic = "force-dynamic";

function sanitizeSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = (k: string) => (Array.isArray(searchParams[k]) ? searchParams[k]?.[0] : searchParams[k]) as string | undefined;
  const email = (q("email") ?? "").trim();
  const tenantSlug = sanitizeSlug(q("t")) ?? sanitizeSlug(q("tenant"));

  return <UnsubscribeClient initialEmail={email} tenantSlug={tenantSlug} />;
}
