/*
 * My Tasks (Sprint 11). Tasks assigned to the current user plus their personal
 * (project-less) tasks. Server component fetches via getMyTasks; the client
 * provides Today/Upcoming/All views, group-by, and Kanban/List/Calendar toggle.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { auth } from "@clerk/nextjs/server";
import { getMyTasks, getMembersLite, listProjects } from "@/lib/projects/queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { MyTasksClient } from "./MyTasksClient";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  try {
    let clerkUserId: string | null = null;
    try {
      clerkUserId = auth().userId ?? null;
    } catch {
      clerkUserId = null;
    }

    const [tasks, members, projects] = await Promise.all([
      clerkUserId ? getMyTasks(clerkUserId) : Promise.resolve([]),
      getMembersLite(),
      listProjects(),
    ]);

    const projectNames = projects.map((p) => ({ id: p.id, name: p.name }));
    return <MyTasksClient tasks={tasks} members={members} projects={projectNames} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
