"use client";

/*
 * Leads kanban (Sprint 10): columns are the stages of a LEAD-type pipeline, with
 * @dnd-kit drag-and-drop. Mirrors DealsBoard but for the Lead model. Dragging a
 * card persists via moveLeadToStage. A pipeline switcher and a List/Kanban toggle
 * (links back to /app/leads) sit in the header.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { TagChips } from "@/components/crm/TagChips";
import { moveLeadToStage } from "../actions";
import type { LeadBoard, LeadKanbanCard, LeadStageCol } from "./queries";

export function LeadsBoard({ board }: { board: LeadBoard }) {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadKanbanCard[]>(board.leads);
  const [mobileStageId, setMobileStageId] = useState<string>(board.stages[0]?.id ?? "");
  const [, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const leadsByStage = useMemo(() => {
    const map = new Map<string, LeadKanbanCard[]>();
    for (const s of board.stages) map.set(s.id, []);
    for (const l of leads) {
      const key = l.stageId ?? board.stages[0]?.id ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return map;
  }, [leads, board.stages]);

  function switchPipeline(id: string) {
    router.push(`/app/leads/kanban?pipeline=${id}`);
  }

  function onDragEnd(e: DragEndEvent) {
    const leadId = String(e.active.id);
    const targetStage = e.over ? String(e.over.id) : null;
    if (!targetStage) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === targetStage) return;
    const prev = leads;
    setLeads((cur) => cur.map((l) => (l.id === leadId ? { ...l, stageId: targetStage } : l)));
    startTransition(async () => {
      try {
        await moveLeadToStage(leadId, targetStage);
        router.refresh();
      } catch {
        setLeads(prev);
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Leads</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Leads</h1>
        </div>
        <div className="flex items-center gap-2">
          {board.pipelines.length > 0 ? (
            <select
              value={board.activePipelineId ?? ""}
              onChange={(e) => switchPipeline(e.target.value)}
              className="rounded px-2 py-1.5 text-sm outline-none"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            >
              {board.pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          ) : null}
          <div className="flex overflow-hidden rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
            <Link href="/app/leads" className="px-3 py-1.5 text-sm" style={{ backgroundColor: "var(--kb-surface)", color: "var(--kb-text-secondary)" }}>List</Link>
            <span className="px-3 py-1.5 text-sm" style={{ backgroundColor: "var(--kb-primary)", color: "#fff" }}>Kanban</span>
          </div>
        </div>
      </div>

      {board.stages.length === 0 ? (
        <div className="grid place-items-center p-16 text-center" style={{ backgroundColor: "var(--kb-surface)", border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
          <p style={{ fontWeight: 600 }}>No lead pipeline yet</p>
          <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            Create a Lead pipeline in Settings / Pipelines to use the kanban.
          </p>
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
              {board.stages.map((stage) => (
                <Column key={stage.id} stage={stage} cards={leadsByStage.get(stage.id) ?? []} />
              ))}
            </div>
          </DndContext>

          <div className="md:hidden">
            <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
              {board.stages.map((stage) => {
                const active = stage.id === mobileStageId;
                return (
                  <button key={stage.id} type="button" onClick={() => setMobileStageId(stage.id)} className="shrink-0 px-3 py-2 text-sm" style={{ color: active ? "var(--kb-primary)" : "var(--kb-text-secondary)", fontWeight: active ? 600 : 400, borderBottom: active ? "2px solid var(--kb-primary)" : "2px solid transparent" }}>
                    {stage.name} ({(leadsByStage.get(stage.id) ?? []).length})
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {(leadsByStage.get(mobileStageId) ?? []).map((l) => <MobileCard key={l.id} lead={l} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Column({ stage, cards }: { stage: LeadStageCol; cards: LeadKanbanCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const accent = stage.color ?? (stage.wonOrLost === "WON" ? "var(--kb-success)" : stage.wonOrLost === "LOST" ? "var(--kb-error)" : "var(--kb-primary)");
  return (
    <div ref={setNodeRef} className="flex w-72 shrink-0 flex-col rounded" style={{ backgroundColor: isOver ? "rgba(29,119,189,0.06)" : "var(--kb-surface-grey)", borderRadius: "var(--kb-radius)", borderTop: `3px solid ${accent}` }}>
      <div className="flex items-center justify-between px-3 py-2">
        <span style={{ fontWeight: 600, color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{stage.name}</span>
        <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{cards.length}</span>
      </div>
      <div className="flex-1 space-y-2 px-2 pb-2">
        {cards.map((c) => <Card key={c.id} lead={c} />)}
      </div>
    </div>
  );
}

function Card({ lead }: { lead: LeadKanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style: React.CSSProperties = {
    backgroundColor: "var(--kb-surface)",
    borderRadius: "var(--kb-radius-sm)",
    boxShadow: "var(--kb-shadow-card)",
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="p-3" {...attributes} {...listeners}>
      <Link href={`/app/leads?open=${lead.id}`} className="block w-full text-left">
        <p style={{ fontWeight: 500, color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{lead.name}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{lead.companyName ?? "No company"}</p>
        {lead.tags.length > 0 ? <div className="mt-2"><TagChips tags={lead.tags} /></div> : null}
      </Link>
    </div>
  );
}

function MobileCard({ lead }: { lead: LeadKanbanCard }) {
  return (
    <Link href={`/app/leads?open=${lead.id}`} className="block w-full p-3 text-left" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
      <div style={{ color: "var(--kb-text-primary)", fontWeight: 600 }}>{lead.name}</div>
      <div className="mt-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>{lead.companyName ?? ""}</div>
    </Link>
  );
}
