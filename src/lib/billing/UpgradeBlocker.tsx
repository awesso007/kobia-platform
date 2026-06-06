/*
 * UpgradeBlocker - inline blocker shown when a tenant's plan is below the
 * minimum required for a feature (Sprint 5). Links to billing settings.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PLANS, type PlanId } from "./plans";

export function UpgradeBlocker({
  feature,
  required,
  current,
}: {
  feature: string;
  required: PlanId;
  current: PlanId;
}) {
  return (
    <div
      className="rounded p-6"
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}
    >
      <div style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
        {feature} is a {PLANS[required].name} feature
      </div>
      <div className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Your workspace is on the {PLANS[current].name} plan. Upgrade to {PLANS[required].name} to unlock this feature.
      </div>
      <div className="mt-4">
        <a
          href="/app/settings/billing"
          className="inline-block rounded px-3 py-1.5 text-sm text-white"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          Upgrade to {PLANS[required].name}
        </a>
      </div>
    </div>
  );
}
