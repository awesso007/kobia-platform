"use client";

/*
 * Automations surface: a list of automations (toggle on/off, edit, soft delete,
 * view run history) plus a two-pane no-code builder modal. Left pane of the
 * builder = trigger + conditions; right pane = the ordered action sequence.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, History, X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import type { TagRow } from "@/lib/crm/record";
import {
  ACTION_KINDS,
  ACTION_LABELS,
  AUTOMATION_ENTITIES,
  AUTOMATION_TRIGGERS,
  CONDITION_OPERATORS,
  OPERATOR_LABELS,
  TRIGGER_LABELS,
  type ActionKind,
  type AutomationAction,
  type AutomationEntityKind,
  type AutomationTriggerKind,
  type ConditionGroup,
  type ConditionRow,
  type TriggerConfig,
} from "@/lib/automations/types";
import { ENTITY_FIELDS } from "@/lib/crm/entity-fields";
import type { AutomationRow } from "./queries";
import { createAutomation, updateAutomation, toggleAutomation, deleteAutomation } from "./actions";
import { RunHistory } from "./RunHistory";

export type EmailAccountOption = { id: string; address: string };
export type EmailTemplateOption = { id: string; name: string };

export function AutomationsClient({
  automations,
  allTags,
  emailAccounts,
  emailTemplates,
}: {
  automations: AutomationRow[];
  allTags: TagRow[];
  emailAccounts: EmailAccountOption[];
  emailTemplates: EmailTemplateOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);
  const [history, setHistory] = useState<AutomationRow | null>(null);
  const [, startTransition] = useTransition();

  function onToggle(a: AutomationRow) {
    startTransition(async () => {
      await toggleAutomation(a.id, !a.enabled);
      router.refresh();
    });
  }
  function onDelete(a: AutomationRow) {
    if (!confirm(`Delete automation "${a.name}"? It will stop running.`)) return;
    startTransition(async () => {
      await deleteAutomation(a.id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Automations</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Automations</h1>
        </div>
        <KbButton onClick={() => setEditing("new")}><Plus size={16} /> New automation</KbButton>
      </div>

      <div className="overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Trigger</th>
              <th className="px-3 py-2 text-left font-medium">Entity</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
              <th className="px-3 py-2 text-left font-medium">Runs</th>
              <th className="px-3 py-2 text-left font-medium">Enabled</th>
              <th className="px-3 py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {automations.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No automations yet. Create one to react to record events.</td></tr>
            ) : (
              automations.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                  <td className="px-3" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>
                    {a.name}
                    {a.description ? <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{a.description}</div> : null}
                  </td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{TRIGGER_LABELS[a.triggerType]}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{a.entityType}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{a.actions.length}</td>
                  <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{a.runCount}</td>
                  <td className="px-3">
                    <button type="button" onClick={() => onToggle(a)} aria-label="Toggle" className="inline-flex h-5 w-9 items-center rounded-full px-0.5" style={{ backgroundColor: a.enabled ? "var(--kb-primary)" : "var(--kb-border)" }}>
                      <span className="h-4 w-4 rounded-full bg-white transition" style={{ transform: a.enabled ? "translateX(16px)" : "translateX(0)" }} />
                    </button>
                  </td>
                  <td className="px-3 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => setHistory(a)} aria-label="Run history" style={{ color: "var(--kb-text-secondary)" }}><History size={16} /></button>
                      <button type="button" onClick={() => setEditing(a)} aria-label="Edit" style={{ color: "var(--kb-text-secondary)" }}><Pencil size={16} /></button>
                      <button type="button" onClick={() => onDelete(a)} aria-label="Delete" style={{ color: "var(--kb-error)" }}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <BuilderModal
          initial={editing === "new" ? null : editing}
          allTags={allTags}
          emailAccounts={emailAccounts}
          emailTemplates={emailTemplates}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      ) : null}
      {history ? <RunHistory automation={history} onClose={() => setHistory(null)} /> : null}
    </div>
  );
}

const emptyConditions: ConditionGroup = { combinator: "AND", rows: [] };

function BuilderModal({ initial, allTags, emailAccounts, emailTemplates, onClose, onSaved }: { initial: AutomationRow | null; allTags: TagRow[]; emailAccounts: EmailAccountOption[]; emailTemplates: EmailTemplateOption[]; onClose: () => void; onSaved: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [entityType, setEntityType] = useState<AutomationEntityKind>(initial?.entityType ?? "LEAD");
  const [triggerType, setTriggerType] = useState<AutomationTriggerKind>(initial?.triggerType ?? "RECORD_CREATED");
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>(initial?.triggerConfig ?? {});
  const [conditions, setConditions] = useState<ConditionGroup>(initial?.conditions ?? emptyConditions);
  const [actions, setActions] = useState<AutomationAction[]>(initial?.actions ?? []);

  const fields = ENTITY_FIELDS[entityType];

  function save() {
    if (!name.trim()) return;
    const input = {
      name,
      description,
      entityType,
      triggerType,
      triggerConfig,
      conditions: conditions.rows.length ? conditions : null,
      actions,
    };
    startTransition(async () => {
      if (initial) await updateAutomation(initial.id, input);
      else await createAutomation(input);
      onSaved();
    });
  }

  function addCondition() {
    setConditions((c) => ({ ...c, rows: [...c.rows, { field: fields[0]?.key ?? "", operator: "eq", value: "" }] }));
  }
  function setCondition(i: number, patch: Partial<ConditionRow>) {
    setConditions((c) => ({ ...c, rows: c.rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function removeCondition(i: number) {
    setConditions((c) => ({ ...c, rows: c.rows.filter((_, idx) => idx !== i) }));
  }

  function addAction(kind: ActionKind) {
    setActions((a) => [...a, { kind, config: {} }]);
  }
  function setActionConfig(i: number, patch: Record<string, unknown>) {
    setActions((a) => a.map((act, idx) => (idx === i ? { ...act, config: { ...act.config, ...patch } } : act)));
  }
  function moveAction(i: number, dir: -1 | 1) {
    setActions((a) => {
      const next = [...a];
      const j = i + dir;
      if (j < 0 || j >= next.length) return a;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }
  function removeAction(i: number) {
    setActions((a) => a.filter((_, idx) => idx !== i));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--kb-border)" }}>
          <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>{initial ? "Edit automation" : "New automation"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto p-5 md:grid-cols-2">
          {/* Left pane: trigger + conditions */}
          <div className="space-y-3">
            <FieldLabel label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            </FieldLabel>
            <FieldLabel label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
            </FieldLabel>
            <FieldLabel label="Entity">
              <select value={entityType} onChange={(e) => { setEntityType(e.target.value as AutomationEntityKind); setConditions(emptyConditions); }} className="w-full rounded px-2 py-2 text-sm outline-none" style={inputStyle}>
                {AUTOMATION_ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="Trigger">
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as AutomationTriggerKind)} className="w-full rounded px-2 py-2 text-sm outline-none" style={inputStyle}>
                {AUTOMATION_TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
              </select>
            </FieldLabel>

            {triggerType === "FIELD_CHANGED" ? (
              <FieldLabel label="Watch field">
                <select value={triggerConfig.field ?? ""} onChange={(e) => setTriggerConfig((c) => ({ ...c, field: e.target.value }))} className="w-full rounded px-2 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">Any field</option>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </FieldLabel>
            ) : null}
            {triggerType === "ACTIVITY_DUE" ? (
              <FieldLabel label="Minutes before due">
                <input type="number" value={triggerConfig.offsetMinutes ?? 0} onChange={(e) => setTriggerConfig((c) => ({ ...c, offsetMinutes: Number(e.target.value) }))} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
              </FieldLabel>
            ) : null}
            {triggerType === "SCHEDULE" ? (
              <FieldLabel label="Cron expression">
                <input value={triggerConfig.cron ?? ""} placeholder="*/5 * * * *" onChange={(e) => setTriggerConfig((c) => ({ ...c, cron: e.target.value }))} className="w-full rounded px-3 py-2 text-sm outline-none" style={inputStyle} />
              </FieldLabel>
            ) : null}

            <div className="pt-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>Conditions</span>
                <select value={conditions.combinator} onChange={(e) => setConditions((c) => ({ ...c, combinator: e.target.value as "AND" | "OR" }))} className="rounded px-1 py-0.5 text-xs outline-none" style={inputStyle}>
                  <option value="AND">Match ALL</option>
                  <option value="OR">Match ANY</option>
                </select>
              </div>
              <div className="space-y-2">
                {conditions.rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <select value={row.field} onChange={(e) => setCondition(i, { field: e.target.value })} className="rounded px-1 py-1 text-xs outline-none" style={inputStyle}>
                      {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={row.operator} onChange={(e) => setCondition(i, { operator: e.target.value as ConditionRow["operator"] })} className="rounded px-1 py-1 text-xs outline-none" style={inputStyle}>
                      {CONDITION_OPERATORS.map((op) => <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>)}
                    </select>
                    {row.operator !== "is_set" && row.operator !== "is_empty" ? (
                      <input value={row.value ?? ""} onChange={(e) => setCondition(i, { value: e.target.value })} placeholder="value" className="w-20 flex-1 rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
                    ) : null}
                    <button type="button" onClick={() => removeCondition(i)} aria-label="Remove condition" style={{ color: "var(--kb-error)" }}><X size={14} /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCondition} className="mt-2 text-xs" style={{ color: "var(--kb-primary)" }}>+ Add condition</button>
            </div>
          </div>

          {/* Right pane: action sequence */}
          <div className="space-y-2" style={{ borderLeft: "1px solid var(--kb-border)", paddingLeft: "1rem" }}>
            <span className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>Action sequence</span>
            {actions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No actions yet. Add one below.</p>
            ) : (
              actions.map((act, i) => (
                <div key={i} className="rounded p-2" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm" style={{ fontWeight: 500 }}>{i + 1}. {ACTION_LABELS[act.kind]}</span>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => moveAction(i, -1)} className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>up</button>
                      <button type="button" onClick={() => moveAction(i, 1)} className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>down</button>
                      <button type="button" onClick={() => removeAction(i)} aria-label="Remove action" style={{ color: "var(--kb-error)" }}><X size={14} /></button>
                    </div>
                  </div>
                  <ActionConfig action={act} fields={fields.map((f) => ({ key: f.key, label: f.label }))} allTags={allTags} emailAccounts={emailAccounts} emailTemplates={emailTemplates} onChange={(patch) => setActionConfig(i, patch)} />
                </div>
              ))
            )}
            <select value="" onChange={(e) => { if (e.target.value) addAction(e.target.value as ActionKind); }} className="mt-2 w-full rounded px-2 py-2 text-sm outline-none" style={inputStyle}>
              <option value="">+ Add action...</option>
              {ACTION_KINDS.map((k) => <option key={k} value={k}>{ACTION_LABELS[k]}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--kb-border)" }}>
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={save} disabled={pending || !name.trim()}>{pending ? "Saving..." : "Save automation"}</KbButton>
        </div>
      </div>
    </div>
  );
}

function ActionConfig({ action, fields, allTags, emailAccounts, emailTemplates, onChange }: { action: AutomationAction; fields: { key: string; label: string }[]; allTags: TagRow[]; emailAccounts: EmailAccountOption[]; emailTemplates: EmailTemplateOption[]; onChange: (patch: Record<string, unknown>) => void }) {
  const c = action.config ?? {};
  const get = (k: string) => (c[k] === undefined ? "" : String(c[k]));
  switch (action.kind) {
    case "CREATE_ACTIVITY":
      return (
        <div className="space-y-1">
          <select value={get("activityType") || "TASK"} onChange={(e) => onChange({ activityType: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            {["TASK", "CALL", "EMAIL", "MEETING", "NOTE"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={get("subject")} onChange={(e) => onChange({ subject: e.target.value })} placeholder="Subject (supports {{record.field}})" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
          <input type="number" value={get("dueOffsetDays") || "1"} onChange={(e) => onChange({ dueOffsetDays: Number(e.target.value) })} placeholder="Due in N days" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
        </div>
      );
    case "UPDATE_FIELD":
      return (
        <div className="space-y-1">
          <select value={get("field")} onChange={(e) => onChange({ field: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            <option value="">Field...</option>
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <input value={get("value")} onChange={(e) => onChange({ value: e.target.value })} placeholder="New value" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
        </div>
      );
    case "CREATE_RECORD":
      return (
        <div className="space-y-1">
          <select value={get("target") || "LEAD"} onChange={(e) => onChange({ target: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            {["LEAD", "CONTACT", "COMPANY"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={get("name")} onChange={(e) => onChange({ name: e.target.value })} placeholder="Name (supports {{record.field}})" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />
        </div>
      );
    case "ADD_TAG":
    case "REMOVE_TAG":
      return (
        <select value={get("tagId")} onChange={(e) => onChange({ tagId: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
          <option value="">Tag...</option>
          {allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      );
    case "ASSIGN_OWNER":
      return <input value={get("ownerUserId")} onChange={(e) => onChange({ ownerUserId: e.target.value })} placeholder="Owner user id" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />;
    case "SEND_EMAIL":
      return (
        <div className="space-y-1">
          <select value={get("accountId")} onChange={(e) => onChange({ accountId: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            <option value="">From account...</option>
            {emailAccounts.map((a) => <option key={a.id} value={a.id}>{a.address}</option>)}
          </select>
          <select value={get("templateId")} onChange={(e) => onChange({ templateId: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            <option value="">Template...</option>
            {emailTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select value={get("to") || "trigger.contact.email"} onChange={(e) => onChange({ to: e.target.value })} className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle}>
            <option value="trigger.contact.email">Recipient: contact email</option>
            <option value="trigger.owner.email">Recipient: record owner</option>
          </select>
          {emailAccounts.length === 0 ? <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>No email accounts connected yet.</div> : null}
        </div>
      );
    case "WAIT":
      return <input type="number" value={get("minutes")} onChange={(e) => onChange({ minutes: Number(e.target.value) })} placeholder="Wait minutes" className="w-full rounded px-2 py-1 text-xs outline-none" style={inputStyle} />;
    default:
      return null;
  }
}

const inputStyle: React.CSSProperties = { border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" };

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}
