import { listProjects, getMembersLite } from "@/lib/projects/queries";
import { ProjectsClient } from "./ProjectsClient";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  try {
    const [projects, members] = await Promise.all([listProjects(), getMembersLite()]);
    return <ProjectsClient projects={projects} members={members} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
