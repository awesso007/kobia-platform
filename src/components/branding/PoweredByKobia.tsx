/**
 * Lock EEEE — "Powered by KOBIA" badge.
 * Only shown on FREE + ENTRY tier tenants.
 * Hidden by default on all paid tiers (SOLO, FIRM, FIRM_PLUS, ENTERPRISE, INTERNAL).
 */
import type { Tenant } from "@prisma/client";
import { shouldShowKobiaBrand } from "@/lib/tenant";

export function PoweredByKobia({ tenant }: { tenant: Tenant }) {
  if (!shouldShowKobiaBrand(tenant)) return null;

  return (
    <footer className="border-t border-border bg-muted/30 px-8 py-3 text-center text-xs text-muted-foreground">
      <a
        href="https://kobia.ai"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground"
      >
        Powered by <span className="font-semibold">KOBIA</span>
      </a>
      <span className="mx-2">·</span>
      <a href="https://kobia.ai/upgrade" className="hover:text-foreground">
        Remove this badge — upgrade
      </a>
    </footer>
  );
}
