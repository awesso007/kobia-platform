import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
} from "@/lib/workflow-runner";
import { createWorkflowRule } from "@/app/actions/workflow-actions";

export const dynamic = "force-dynamic";

const TRIGGERS = Object.keys(TRIGGER_LABELS) as Array<keyof typeof TRIGGER_LABELS>;
const ACTIONS: Array<keyof typeof ACTION_LABELS> = [
  "CREATE_TASK",
  "LOG_ACTIVITY",
  "SEND_INTERNAL_NOTE",
  "UPDATE_DEAL_STAGE",
];

export default async function NewWorkflowPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <Link
          href={`/${params.tenant}/workflows`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to workflows
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">New rule</h1>
      <p className="mt-1 text-sm text-slate-500">
        Pick a trigger (when this happens) and an action (do this).
      </p>

      <form
        action={createWorkflowRule.bind(null, params.tenant)}
        className="mt-6 max-w-2xl space-y-5 rounded-lg border border-slate-200 bg-white p-5"
      >
        <Field label="Rule name">
          <input
            name="name"
            required
            placeholder="e.g., Follow up after invoice paid"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="Description (optional)">
          <input
            name="description"
            placeholder="What this rule does"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
        </Field>

        <Field label="When this happens (trigger)">
          <select
            name="trigger"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>
                {TRIGGER_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Then do this (action)">
          <select
            name="action_type"
            required
            defaultValue="CREATE_TASK"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Action configuration
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Fill in fields for the action you picked above. Unused fields are
            ignored.
          </p>

          <div className="mt-3 space-y-4">
            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Create a task
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  name="task_title"
                  placeholder="Task title"
                  className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  name="task_priority"
                  defaultValue="MED"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MED">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <input
                  name="task_due_in_days"
                  type="number"
                  min={0}
                  placeholder="Due in N days"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Log a CRM activity
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  name="activity_type"
                  defaultValue="NOTE"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="NOTE">Note</option>
                  <option value="CALL">Call</option>
                  <option value="EMAIL">Email</option>
                  <option value="MEETING">Meeting</option>
                  <option value="TASK">Task</option>
                </select>
                <input
                  name="activity_subject"
                  placeholder="Subject"
                  className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <textarea
                  name="activity_body"
                  placeholder="Body (optional)"
                  rows={2}
                  className="col-span-3 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Only fires on lead or deal triggers.
              </p>
            </div>

            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Send an internal note
              </div>
              <input
                name="note"
                placeholder="Note saved to audit log"
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Update deal stage
              </div>
              <input
                name="target_stage_name"
                placeholder='e.g., "Closed Won"'
                className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Only fires on deal triggers.
              </p>
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            value="1"
            defaultChecked
            className="h-4 w-4 rounded border-slate-300"
          />
          Active (start running this rule immediately)
        </label>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link
            href={`/${params.tenant}/workflows`}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Create rule
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
