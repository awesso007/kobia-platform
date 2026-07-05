"use client";

/*
 * Client components for the Forms 2.0 admin module (Sprint 19). Layout
 * primitives shared across list/submissions/analytics plus the new-form
 * creator. The builder itself lives in FormBuilderUI.tsx to keep this lean.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { statusColor } from "./forms2-ui-utils";

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
    <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
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
    <th className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
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
    <span className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium" style={{ color, backgroundColor: `${color}1a`, borderRadius: "var(--kb-radius-sm)" }}>
      {status}
    </span>
  );
}

export function NewFormForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/forms2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        setError((await res.text()) || "Failed");
        return;
      }
      const data = await res.json();
      router.push(`/app/forms2/${data.id}`);
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
      {error ? (
        <p className="text-sm" style={{ color: "#dc2626" }}>
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Link href="/app/forms2" className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)" }}>
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
