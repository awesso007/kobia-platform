/*
 * Workflow editor page (Sprint 18). Server component that loads the workflow
 * and renders the client-side visual editor.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { getWorkflow } from "@/lib/workflows/queries";
import { WorkflowEditor } from "../WorkflowEditorUI";

export const dynamic = "force-dynamic";

export default async function WorkflowEditorPage({ params }: { params: { id: string } }) {
  try {
    const { db } = getTenantDb();
    const workflow = await getWorkflow(db, params.id);
    if (!workflow) notFound();
    return (
      <div>
        <div className="px-4 pt-3 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <Link href="/app/workflows">Workflows</Link>
          {" / "}
          <Link href={`/app/workflows/${workflow.id}/runs`}>Runs</Link>
        </div>
        <WorkflowEditor
          workflowId={workflow.id}
          name={workflow.name}
          description={workflow.description}
          entryTriggerType={workflow.entryTriggerType}
          status={workflow.status}
          graph={workflow.graph}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
