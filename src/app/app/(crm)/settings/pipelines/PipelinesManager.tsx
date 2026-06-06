"use client";

/*
 * Pipelines settings manager (Sprint 10). Two tabs (Deal Pipelines, Lead
 * Pipelines). Each tab lists its pipelines with create / set-default / archive /
 * duplicate controls and an inline stage editor: add/remove stages, reorder with
 * up/dn, edit name, probability, rotting days, won/lost, and color.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Plus, Star, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  archivePipeline,
  createPipeline,
  duplicatePipeline,
  saveStages,
  setDefaultPipeline,
  type StageInput,
} from "./actions";

type WonOrLost = "OPEN" | "WON" | "LOST";

export type StageRow = {
  id: string;
  name: string;
  sortOrder: number;
  probability: number;
  rotting_days: number | null;
  wonOrLost: WonOrLost;
  color: string | null;
};

export type PipelineRow = {
  id: string;
  name: string;
  entityType: "DEAL" | "LEAD";
  isDefault: boolean;
  archived: boolean;
  color: string | null;
  dealCount: number;
  stages: StageRow[];
};

export function PipelinesManager({ pipelines }: { pipelines: PipelineRow[] }) {
  const [tab, setTab] = useState<"DEAL" | "LEAD">("DEAL");
  const visible = useMemo(() => pipelines.filter((p) => p.entityType === tab), [pipelines, tab]);

  return (
    <div>
      <div className="mb-4 flex gap-1" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        {(["DEAL", "LEAD"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm"
            style={{
              color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)",
              fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t === "DEAL" ? "Deal Pipelines" : "Lead Pipelines"}
          </button>
        ))}
      </div>

      <CreatePipeline entityType={tab} />

      <div className="space-y-3">
        {visible.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No {tab === "DEAL" ? "deal" : "lead"} pipelines yet.</p>
        ) : (
          visible.map((p) => <PipelineCard key={p.id} pipeline={p} />)
        )}
      </div>
    </div>
  );
}

function CreatePipeline({ entityType }: { entityType: "DEAL" | "LEAD" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    startTransition(async () => {
      await createPipeline({ name: trimmed, entityType });
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={`New ${entityType === "DEAL" ? "deal" : "lead"} pipeline name`}
        className="rounded px-3 py-2 text-sm outline-none"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 240 }}
      />
      <KbButton onClick={submit} disabled={pending || !name.trim()}>
        <Plus size={14} /> Create pipeline
      </KbButton>
    </div>
  );
}

function PipelineCard({ pipeline }: { pipeline: PipelineRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [stages, setStages] = useState<StageRow[]>(pipeline.stages);

  function persist(next: StageRow[]) {
    setStages(next);
  }

  function addStage() {
    persist([
      ...stages,
      { id: "", name: "New stage", sortOrder: stages.length, probability: 0, rotting_days: null, wonOrLost: "OPEN", color: null },
    ]);
  }

  function updateStage(idx: number, patch: Partial<StageRow>) {
    persist(stages.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeStage(idx: number) {
    persist(stages.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= stages.length) return;
    const next = [...stages];
    const a = next[idx]!;
    const b = next[target]!;
    next[idx] = b;
    next[target] = a;
    persist(next);
  }

  function saveAll() {
    const payload: StageInput[] = stages.map((s, i) => ({
      id: s.id || undefined,
      name: s.name,
      sortOrder: i,
      probability: s.probability,
      rotting_days: s.rotting_days,
      wonOrLost: s.wonOrLost,
      color: s.color,
    }));
    startTransition(async () => {
      await saveStages(pipeline.id, payload);
      router.refresh();
    });
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  return (
    <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", opacity: pipeline.archived ? 0.6 : 1 }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left">
          <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--kb-text-secondary)" }} />
          <span style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>{pipeline.name}</span>
          {pipeline.isDefault ? (
            <span className="text-[10px] uppercase" style={{ color: "var(--kb-primary)", fontWeight: 700 }}>Default</span>
          ) : null}
          {pipeline.archived ? (
            <span className="text-[10px] uppercase" style={{ color: "var(--kb-text-secondary)" }}>Archived</span>
          ) : null}
          <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{pipeline.stages.length} stages - {pipeline.dealCount} deals</span>
        </button>
        <div className="flex items-center gap-1">
          {!pipeline.isDefault && !pipeline.archived ? (
            <button type="button" disabled={pending} onClick={() => run(() => setDefaultPipeline(pipeline.id))} title="Set as default" className="grid h-8 w-8 place-items-center rounded" style={{ color: "var(--kb-text-secondary)" }}>
              <Star size={15} />
            </button>
          ) : null}
          <button type="button" disabled={pending} onClick={() => run(() => duplicatePipeline(pipeline.id))} title="Duplicate" className="grid h-8 w-8 place-items-center rounded" style={{ color: "var(--kb-text-secondary)" }}>
            <Copy size={15} />
          </button>
          <button type="button" disabled={pending} onClick={() => run(() => archivePipeline(pipeline.id, !pipeline.archived))} className="rounded px-2 py-1 text-xs" style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>
            {pipeline.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--kb-text-secondary)" }}>
                  <th className="py-1 text-left font-medium">Stage</th>
                  <th className="py-1 text-left font-medium">Prob %</th>
                  <th className="py-1 text-left font-medium">Rotting days</th>
                  <th className="py-1 text-left font-medium">Type</th>
                  <th className="py-1 text-left font-medium">Color</th>
                  <th className="py-1 text-right font-medium">Order</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s, idx) => (
                  <tr key={s.id || `new-${idx}`} style={{ borderTop: "1px solid var(--kb-border)" }}>
                    <td className="py-1 pr-2">
                      <input value={s.name} onChange={(e) => updateStage(idx, { name: e.target.value })} className="w-full rounded px-2 py-1 outline-none" style={{ border: "1px solid var(--kb-border)" }} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min={0} max={100} value={s.probability} onChange={(e) => updateStage(idx, { probability: Number(e.target.value) })} className="w-16 rounded px-2 py-1 outline-none" style={{ border: "1px solid var(--kb-border)" }} />
                    </td>
                    <td className="py-1 pr-2">
                      <input type="number" min={0} value={s.rotting_days ?? ""} onChange={(e) => updateStage(idx, { rotting_days: e.target.value === "" ? null : Number(e.target.value) })} placeholder="-" className="w-20 rounded px-2 py-1 outline-none" style={{ border: "1px solid var(--kb-border)" }} />
                    </td>
                    <td className="py-1 pr-2">
                      <select value={s.wonOrLost} onChange={(e) => updateStage(idx, { wonOrLost: e.target.value as WonOrLost })} className="rounded px-2 py-1 outline-none" style={{ border: "1px solid var(--kb-border)" }}>
                        <option value="OPEN">Open</option>
                        <option value="WON">Won</option>
                        <option value="LOST">Lost</option>
                      </select>
                    </td>
                    <td className="py-1 pr-2">
                      <input type="color" value={s.color ?? "#1d77bd"} onChange={(e) => updateStage(idx, { color: e.target.value })} className="h-7 w-10 rounded" />
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <button type="button" onClick={() => move(idx, -1)} aria-label="Move up" style={{ color: "var(--kb-text-secondary)" }}>up</button>
                      <span> </span>
                      <button type="button" onClick={() => move(idx, 1)} aria-label="Move down" style={{ color: "var(--kb-text-secondary)" }}>dn</button>
                    </td>
                    <td className="py-1 text-right">
                      <button type="button" onClick={() => removeStage(idx)} aria-label="Remove stage" style={{ color: "var(--kb-error)" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <KbButton variant="outline" onClick={addStage}><Plus size={14} /> Add stage</KbButton>
            <KbButton onClick={saveAll} disabled={pending}>{pending ? "Saving..." : "Save stages"}</KbButton>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            Stages with deals cannot be deleted; move their deals first.
          </p>
        </div>
      ) : null}
    </div>
  );
}
