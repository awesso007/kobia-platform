import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import { TeamManager, type MemberRow } from "./TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  try {
    const { db } = getTenantDb();
    const [members, me] = await Promise.all([
      db.membership.findMany({ orderBy: [{ role: "asc" }, { joinedAt: "asc" }] }),
      getCurrentMembership(),
    ]);
    const rows: MemberRow[] = members.map((m) => ({
      id: m.id,
      clerkUserId: m.clerkUserId,
      role: m.role,
      email: m.email,
      displayName: m.displayName,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <TeamManager members={rows} myRole={me?.role ?? "OWNER"} myClerkUserId={me?.clerkUserId ?? null} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
