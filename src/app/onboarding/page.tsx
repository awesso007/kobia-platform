/*
 * Onboarding (Sprint 5). Shown to a signed-in user who has no Membership in any
 * tenant. They pick a workspace slug + company name; the server action
 * provisions the tenant and sets the active-tenant cookie. The actual redirect
 * decision (who lands here) is enforced in the CRM layout / middleware guard;
 * this page itself is reachable directly.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { OnboardingClient } from "./OnboardingClient";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <div className="kobia-crm min-h-screen w-full" style={{ backgroundColor: "var(--kb-surface-grey)", padding: "64px 16px" }}>
      <div
        className="mx-auto rounded p-6"
        style={{ maxWidth: "460px", backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}
      >
        <h1 className="mb-1" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
          Create your workspace
        </h1>
        <p className="mb-5 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          Set up your CRM workspace. You can change the name later in settings.
        </p>
        <OnboardingClient />
      </div>
    </div>
  );
}
