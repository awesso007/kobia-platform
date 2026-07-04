"use client";

/*
 * Client components for the Workflows module (Sprint 18). Layout primitives,
 * the new-workflow form, publish/status controls, and the runs cancel button.
 * The heavy visual editor lives in WorkflowEditorUI.tsx to keep this file lean.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { statusColor } from "./workflow-ui-utils";

type ReactChildren = { children: React.ReactNode };

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children }: ReactChildren) {
  return (
    <div
      style={{
        backgroundColor: "var(--kb-surface)",
        border: "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius)",
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
      {message}
    </div>
  );
}

export function Th({ children }: ReactChildren) {
  return (
    <th
      className="px-3 py-2 text-left text-xs font-medium uppercase"
      style={{ color: "var(--kb-text-secondary)" }}
    >
      {children}
    </th>
  );
}

export function Td({ children }: ReactChildren) {
  return (
    <td className="px-3 py-2" style={{ color: "var(--kb-text-primary)" }}>
      {children}
    </td>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: `${color}1a`, borderRadius: "var(--kb-radius-sm)" }}
    >
      {status}
    </span>
  );
}

const TRIGGER_OPTIONS = [
  "LEAD_CREATED",
  "DEAL_CREATED",
  "DEAL_WON",
  "DEAL_LOST",
  "CONTACT_CREATED",
  "TASK_COMPLETED",
  "EMAIL_RECEIVED",
  "EVENT_CREATED",
  "TICKET_CREATED",
  "SLA_BREACHED",
  "CAMPAIGN_SENT",
  "DOCUMENT_SIGNED",
  "CHAT_MESSAGE",
  "CHAT_MENTION",
  "SITE_FORM_SUBMIT",
  "SITE_PAGE_PUBLISHED",
];

export function NewWorkflowForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [entryTriggerType, setEntryTriggerType] = useState(TRIGGER_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, entryTriggerType }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Failed");
        return;
      }
      const data = await res.json();
      router.push(`/app/workflows/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded px-3 py-2 text-sm"
          style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded px-3 py-2 text-sm"
          style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
          Entry trigger
        </label>
        <select
          value={entryTriggerType}
          onChange={(e) => setEntryTriggerType(e.target.value)}
          className="mt-1 w-full rounded px-3 py-2 text-sm"
          style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
        >
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Link
          href="/app/workflows"
          className="rounded px-3 py-1.5 text-sm"
          style={{ border: "1px solid var(--kb-border)" }}
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {isPending ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}

export function CancelRunButton({ workflowId, runId }: { workflowId: string; runId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function onCancel() {
    if (!confirm("Cancel this run?")) return;
    startTransition(async () => {
      await fetch(`/api/workflows/${workflowId}/runs/${runId}/cancel`, { method: "POST" });
      router.refresh();
    });
  }
  return (
    <button
      onClick={onCancel}
      disabled={isPending}
      className="rounded px-2 py-1 text-xs"
      style={{ border: "1px solid var(--kb-border)" }}
    >
      {isPending ? "Cancelling..." : "Cancel run"}
    </button>
  );
}
