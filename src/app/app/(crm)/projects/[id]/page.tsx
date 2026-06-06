import { notFound } from "next/navigation";
import { getProjectDetail, getMembersLite } from "@/lib/projects/queries";
import { ProjectDetailClient } from "./ProjectDetailClient";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  try {
    const [detail, members] = await Promise.all([getProjectDetail(params.id), getMembersLite()]);
    if (!detail) notFound();
    return <ProjectDetailClient detail={detail} members={members} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
