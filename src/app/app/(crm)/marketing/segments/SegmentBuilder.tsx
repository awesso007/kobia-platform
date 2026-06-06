"use client";

/*
 * Segment builder (Sprint 13). Edits a segment's name, target entity, and a
 * single condition group (combinator + rows) reusing the automations operator
 * set. Used for both create and edit. Re-evaluates the recipient count on save.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SEGMENT_FIELDS, type SegmentEntity } from "@/lib/marketing/segments";
import { CONDITION_OPERATORS, OPERATOR_LABELS, type ConditionOperator } from "@/lib/automations/types";
import { createSegment, updateSegment, deleteSegment, evaluateSegmentAction } from "../actions";
import { PageHeader, Card } from "../MarketingUI";

type Row = { field: string; operator: ConditionOperator; value: string };

export function SegmentBuilder({
  segment,
}: {
  segment?: {
    id: string;
    name: string;
    description: string | null;
    entityType: string;
    filterJson: unknown;
    recipientCountCache: number;
  };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(segment?.name ?? "");
  const [description, setDescription] = useState(segment?.description ?? "");
  const [entityType, setEntityType] = useState<SegmentEntity>((segment?.entityType as SegmentEntity) ?? "contact");
  const initial = (segment?.filterJson ?? {}) as { combinator?: string; rows?: Row[] };
  const [combinator, setCombinator] = useState<"AND" | "OR">(initial.combinator === "OR" ? "OR" : "AND");
  const [rows, setRows] = useState<Row[]>(
    Array.isArray(initial.rows) && initial.rows.length
      ? initial.rows.map((r) => ({ field: r.field, operator: (r.operator as ConditionOperator) ?? "eq", value: r.value ?? "" }))
      : [],
  );
  const [count, setCount] = useState<number | null>(segment?.recipientCountCache ?? null);
  const [error, setError] = useState<string | null>(null);

  const fields = SEGMENT_FIELDS[entityType];

  function addRow() {
    setRows((r) => [...r, { field: fields[0]?.field ?? "", operator: "eq", value: "" }]);
  }
  function updateRow(i: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  function buildFilter() {
    return { combinator, rows: rows.filter((r) => r.field).map((r) => ({ field: r.field, operator: r.operator, value: r.value })) };
  }

  function save() {
    setError(null);
    const input = { name, description, entityType, filterJson: buildFilter() };
    start(async () => {
      try {
        if (segment) {
          await updateSegment(segment.id, input);
          router.refresh();
        } else {
          const id = await createSegment(input);
          router.push(`/app/marketing/segments/${id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save segment.");
      }
    });
  }

  function evaluate() {
    if (!segment) return;
    setError(null);
    start(async () => {
      try {
        const n = await evaluateSegmentAction(segment.id);
        setCount(n);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not evaluate segment.");
      }
    });
  }

  function remove() {
    if (!segment) return;
    if (!confirm("Delete this segment?")) return;
    start(async () => {
      await deleteSegment(segment.id);
      router.push("/app/marketing/segments");
    });
  }

  return (
    <div className="p-6">
      <PageHeader
        title={segment ? "Edit segment" : "New segment"}
        subtitle="An empty filter matches every record of the chosen type."
        action={
          segment ? (
            <button
              onClick={remove}
              disabled={pending}
              className="rounded px-3 py-1.5 text-sm font-medium"
              style={{ color: "var(--kb-error)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            >
              Delete
            </button>
          ) : null
        }
      />

      {error ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#d9534f1a", color: "var(--kb-error)" }}>
          {error}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Active leads" />
          </Field>
          <Field label="Audience type">
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as SegmentEntity);
                setRows([]);
              }}
              style={inputStyle}
            >
              <option value="contact">Contacts</option>
              <option value="lead">Leads</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Optional" />
        </Field>

        <div className="mt-5">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
              Match
            </span>
            <select value={combinator} onChange={(e) => setCombinator(e.target.value as "AND" | "OR")} style={{ ...inputStyle, width: "auto" }}>
              <option value="AND">all (AND)</option>
              <option value="OR">any (OR)</option>
            </select>
            <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              of these conditions
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select value={row.field} onChange={(e) => updateRow(i, { field: e.target.value })} style={{ ...inputStyle, width: "auto" }}>
                  {fields.map((f) => (
                    <option key={f.field} value={f.field}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select value={row.operator} onChange={(e) => updateRow(i, { operator: e.target.value as ConditionOperator })} style={{ ...inputStyle, width: "auto" }}>
                  {CONDITION_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>
                {row.operator !== "is_set" && row.operator !== "is_empty" ? (
                  <input value={row.value} onChange={(e) => updateRow(i, { value: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="Value" />
                ) : (
                  <div className="flex-1" />
                )}
                <button onClick={() => removeRow(i)} className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button onClick={addRow} className="mt-2 text-sm font-medium" style={{ color: "var(--kb-primary)" }}>
            + Add condition
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
          >
            {pending ? "Saving..." : "Save segment"}
          </button>
          {segment ? (
            <button
              onClick={evaluate}
              disabled={pending}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              Re-evaluate
            </button>
          ) : null}
          {count !== null ? (
            <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              {count} recipient{count === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "14px",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  backgroundColor: "var(--kb-surface)",
  color: "var(--kb-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
