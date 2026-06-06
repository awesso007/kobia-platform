/*
 * Reports landing page (Sprint 4). Server component: runs the three built-in
 * reports and lists saved custom reports, then hands them to the client view.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { pipelineFunnel, dealVelocity, activityLeaderboard, quotePerformance, productPerformance, projectPerformance, teamWorkload, listSavedReports } from "./queries";
import { ReportsClient } from "./ReportsClient";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  try {
    const [funnel, velocity, leaderboard, quotes, products, projects, workload, saved] = await Promise.all([
      pipelineFunnel(),
      dealVelocity(),
      activityLeaderboard(),
      quotePerformance(),
      productPerformance(),
      projectPerformance(),
      teamWorkload(),
      listSavedReports(),
    ]);
    return <ReportsClient funnel={funnel} velocity={velocity} leaderboard={leaderboard} quotes={quotes} products={products} projects={projects} workload={workload} saved={saved} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
