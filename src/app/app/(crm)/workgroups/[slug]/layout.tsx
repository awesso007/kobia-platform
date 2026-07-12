/*
 * Workgroup shell layout (Sprint 22). Server component: loads the group + caller
 * role and renders the identity header + tab nav around the active segment. A
 * missing group renders a not-found message; no tenant renders CrmError.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { loadGroupShell } from "../queries";
import { GroupHeader, type GroupHeaderData } from "../GroupHeaderUI";

export const dynamic = "force-dynamic";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  try {
    const { group } = await loadGroupShell(params.slug);
    if (!group) {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <Link href="/app/workgroups" className="mb-2 inline-block text-sm underline" style={{ color: "var(--kb-text-secondary)" }}>
            All groups
          </Link>
          <p className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            This group does not exist or you cannot access it.
          </p>
        </div>
      );
    }
    const header: GroupHeaderData = {
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description,
      visibility: group.visibility,
      icon: group.icon,
      coverColor: group.coverColor,
      status: group.status,
      memberCount: group.memberCount,
      myRole: group.myRole,
    };
    return (
      <div className="mx-auto max-w-2xl p-6">
        <GroupHeader group={header} />
        {children}
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
