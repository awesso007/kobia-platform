"use client";

/*
 * Custom report builder (v1). Left column configures the definition (entity,
 * columns, filters, group-by + aggregation, chart type); the right column shows
 * a live preview rendered from previewReport(). Save persists to SavedReport
 * via saveReport/updateReport and returns to the reports landing page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KbButton } from "@/components/crm/ui";
import { ENTITY_FIELDS } from "@/lib/crm/entity-fields";
import {
  AGGREGATIONS,
  CHART_TYPES,
  REPORT_ENTITIES,
  REPORT_OPERATORS,
  REPORT_OPERATOR_LABELS,
  type ChartType,
  type ReportDefinition,
  type ReportFilter,
  type ReportResult,
} from "@/lib/reports/types";
import type { AutomationEntityKind } from "@/lib/automations/types";
import { saveReport, updateReport, previewReport } from "../actions";

const CHART_COLORS = ["#1d77bd", "#2fc6f6", "#5cb85c", "#7d4aea", "#f0ad4e", "#d9534f"];

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
};

export function BuilderClient({
  reportId,
  initialName,
  initialDefinition,
}: {
  reportId: string | null;
  initialName: string;
  initialDefinition: ReportDefinition;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [def, setDef] = useState<ReportDefinition>(initialDefinition);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();

  const fields = ENTITY_FIELDS[def.entity];

  useEffect(() => {
    let active = true;
    startPreview(async () => {
      const r = await previewReport(def);
      if (active) setResult(r);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(def)]);

  function patch(p: Partial<ReportDefinition>) {
    setDef((prev) => ({ ...prev, ...p }));
  }

  function setEntity(entity: AutomationEntityKind) {
    setDef({ entity, columns: [], filters: [], groupBy: null, aggregation: "count", aggregateField: null, chart: def.chart });
  }

  function toggleColumn(key: string) {
    setDef((prev) => ({
      ...prev,
      columns: prev.columns.includes(key) ? prev.columns.filter((c) => c !== key) : [...prev.columns, key],
    }));
  }

  function addFilter() {
    patch({ filters: [...def.filters, { field: fields[0]?.key ?? "", operator: "eq", value: "" }] });
  }
  function updateFilter(i: number, p: Partial<ReportFilter>) {
    patch({ filters: def.filters.map((f, idx) => (idx === i ? { ...f, ...p } : f)) });
  }
  function removeFilter(i: number) {
    patch({ filters: def.filters.filter((_, idx) => idx !== i) });
  }

  function save() {
    if (!name.trim()) return;
    startSave(async () => {
      if (reportId) await updateReport(reportId, { name, definition: def });
      else await saveReport({ name, definition: def });
      router.push("/app/reports");
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/app/reports" style={{ color: "var(--kb-text-secondary)" }}><ArrowLeft size={18} /></Link>
          <div>
            <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Reports / Builder</div>
            <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{reportId ? "Edit report" : "New report"}</h1>
          </div>
        </div>
        <KbButton onClick={save} disabled={saving || !name.trim()}>{saving ? "Saving..." : "Save report"}</KbButton>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
          <Field label="Report name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="My report" className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
          </Field>

          <Field label="Entity">
            <select value={def.entity} onChange={(e) => setEntity(e.target.value as AutomationEntityKind)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
              {REPORT_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </Field>

          <Field label="Columns">
            <div className="flex flex-wrap gap-1.5">
              {fields.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleColumn(f.key)}
                  className="rounded px-2 py-1 text-xs"
                  style={{ ...inputStyle, backgroundColor: def.columns.includes(f.key) ? "var(--kb-primary)" : "var(--kb-surface)", color: def.columns.includes(f.key) ? "#fff" : "var(--kb-text-secondary)" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Filters">
            <div className="space-y-2">
              {def.filters.map((f, i) => {
                const needsValue = f.operator !== "is_set" && f.operator !== "is_empty";
                return (
                  <div key={i} className="flex items-center gap-1">
                    <select value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value })} className="rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
                      {fields.map((ff) => <option key={ff.key} value={ff.key}>{ff.label}</option>)}
                    </select>
                    <select value={f.operator} onChange={(e) => updateFilter(i, { operator: e.target.value as ReportFilter["operator"] })} className="rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
                      {REPORT_OPERATORS.map((op) => <option key={op} value={op}>{REPORT_OPERATOR_LABELS[op]}</option>)}
                    </select>
                    {needsValue ? (
                      <input value={f.value ?? ""} onChange={(e) => updateFilter(i, { value: e.target.value })} className="w-20 rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
                    ) : null}
                    <button type="button" onClick={() => removeFilter(i)} aria-label="Remove filter" style={{ color: "var(--kb-error)" }}><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <button type="button" onClick={addFilter} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--kb-primary)" }}><Plus size={12} /> Add filter</button>
            </div>
          </Field>

          <Field label="Group by">
            <select value={def.groupBy ?? ""} onChange={(e) => patch({ groupBy: e.target.value || null })} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">None</option>
              {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </Field>

          {def.groupBy ? (
            <>
              <Field label="Aggregation">
                <select value={def.aggregation ?? "count"} onChange={(e) => patch({ aggregation: e.target.value as ReportDefinition["aggregation"] })} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
                  {AGGREGATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              {def.aggregation && def.aggregation !== "count" ? (
                <Field label="Aggregate field">
                  <select value={def.aggregateField ?? ""} onChange={(e) => patch({ aggregateField: e.target.value || null })} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
                    <option value="">Select...</option>
                    {fields.filter((f) => f.kind === "number").map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </Field>
              ) : null}
            </>
          ) : null}

          <Field label="Chart">
            <select value={def.chart ?? "none"} onChange={(e) => patch({ chart: e.target.value as ChartType })} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle}>
              {CHART_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>

        <div className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
          <h2 className="mb-3" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Preview</h2>
          {previewing && !result ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
          ) : !result || result.rows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No rows match this definition.</p>
          ) : (
            <Preview result={result} />
          )}
        </div>
      </div>
    </div>
  );
}

function Preview({ result }: { result: ReportResult }) {
  const isGrouped = Boolean(result.groupBy);
  const chart = result.chart;

  return (
    <div>
      {isGrouped && chart !== "none" ? (
        <div style={{ width: "100%", height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart === "pie" ? (
              <PieChart>
                <Tooltip />
                <Pie data={result.rows} dataKey="value" nameKey="group" outerRadius={100} label>
                  {result.rows.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
              </PieChart>
            ) : chart === "line" ? (
              <LineChart data={result.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border)" />
                <XAxis dataKey="group" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} />
              </LineChart>
            ) : (
              <BarChart data={result.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border)" />
                <XAxis dataKey="group" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      ) : null}

      <div className="mt-3 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--kb-text-secondary)" }}>
              {result.columns.map((c) => <th key={c.key} className="px-2 py-1 text-left font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {result.rows.slice(0, 100).map((r, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--kb-border)" }}>
                {result.columns.map((c) => (
                  <td key={c.key} className="px-2 py-1" style={{ color: "var(--kb-text-secondary)" }}>{r[c.key] === null || r[c.key] === undefined ? "-" : String(r[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}
