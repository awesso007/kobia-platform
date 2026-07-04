/*
 * New workflow page (Sprint 18).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { PageHeader, Card, NewWorkflowForm } from "../WorkflowsUI";

export const dynamic = "force-dynamic";

export default function NewWorkflowPage() {
  return (
    <div className="p-6">
      <PageHeader title="New workflow" subtitle="Name it, pick an entry trigger, then design the graph." />
      <div className="max-w-xl">
        <Card>
          <div className="p-4">
            <NewWorkflowForm />
          </div>
        </Card>
      </div>
    </div>
  );
}
