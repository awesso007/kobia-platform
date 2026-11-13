/**
 * Public unsubscribe: only a server-authenticated opaque email capability
 * may select the recipient. Query-string email/tenant fields are untrusted.
 */
import { openUnsubscribeIdentity } from "@/lib/security/public-unsubscribe-round54";
import { activePublicTenantSchema } from "@/lib/security/public-tenant";
import { UnsubscribeClient } from "./UnsubscribeClient";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const raw = Array.isArray(searchParams.cap) ? searchParams.cap[0] : searchParams.cap;
  const identity = openUnsubscribeIdentity(raw);
  let valid = false;
  if (identity) {
    try { valid = !!(await activePublicTenantSchema(identity.tenant)); }
    catch { valid = false; }
  }
  return <UnsubscribeClient initialEmail={valid ? identity!.email : ""}
    capability={valid && typeof raw === "string" ? raw : null} />;
}
