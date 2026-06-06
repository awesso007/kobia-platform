"use client";

/*
 * Deals board: kanban (columns = DealStage of the active pipeline) with
 * @dnd-kit drag-and-drop, plus a List fallback. Dragging a card to another
 * column updates the deal's stage optimistically, then persists via the
 * moveDealToStage server action. Pipeline switcher and Kanban/List toggle live
 * in the header. "+ New Deal" per column opens a small create modal.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { KbButton, StatusBadge } from "@/components/crm/ui";
import { RecordPane } from "@/components/crm/record-pane/RecordPane";
import { TagChips } from "@/components/crm/TagChips";
import { TagPicker } from "@/components/crm/TagPicker";
import { CustomFieldInputs } from "@/components/crm/CustomFieldInputs";
import type { CustomFieldDef, CustomFieldValueMap, TagRow } from "@/lib/crm/record";
import type { DealBoard, DealCard, StageCol } from "./queries";
import { createDeal, moveDealToStage, updateDealMeta, loadDealDetail } from "./actions";
import { LineItemsSection } from "./line-items/LineItemsSection";

export function DealsBoard({ board, allTags, customFields }: { board: DealBoard; allTags: TagRow[]; customFields: CustomFieldDef[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [deals, setDeals] = useState<DealCard[]>(board.deals);
  const [creatingStage, setCreatingStage] = useState<StageCol | null>(null);
  const [openDeal, setOpenDeal] = useState<DealCard | null>(null);
  const [mobileStageId, setMobileStageId] = useState<string>(board.stages[0]?.id ?? "");
  const [, startTransition] = useTransition();

  // Open a deal's pane when arriving from the command palette (?open=<id>).
  const openId = sp.get("open");
  useEffect(() => {
    if (!openId) return;
    const card = board.deals.find((d) => d.id === openId);
    if (card) setOpenDeal(card);
    const next = new URLSearchParams(sp.toString());
    next.delete("open");
    router.replace(`/app/deals${next.toString() ? `?${next.toString()}` : ""}`);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [openId]);

  useEffect(() => {
    const onNew = () => {
      const first = board.stages[0];
      if (first) setCreatingStage(first);
    };
    const onEscape = () => {
      setCreatingStage(null);
      setOpenDeal(null);
    };
    window.addEventListener("kobia:new-record", onNew);
    window.addEventListener("kobia:escape", onEscape);
    return () => {
      window.removeEventListener("kobia:new-record", onNew);
      window.removeEventListener("kobia:escape", onEscape);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [board.stages]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dealsByStage = useMemo(() => {
    const map = new Map<string, DealCard[]>();
    for (const s of board.stages) map.set(s.id, []);
    for (const d of deals) {
      if (!map.has(d.stageId)) map.set(d.stageId, []);
      map.get(d.stageId)!.push(d);
    }
    return map;
  }, [deals, board.stages]);

  function switchPipeline(id: string) {
    router.push(`/app/deals?pipeline=${id}`);
  }

  function onDragEnd(e: DragEndEvent) {
    const dealId = String(e.active.id);
    const targetStage = e.over ? String(e.over.id) : null;
    if (!targetStage) return;
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stageId === targetStage) return;

    const prev = deals;
    setDeals((cur) => cur.map((d) => (d.id === dealId ? { ...d, stageId: targetStage } : d)));
    startTransition(async () => {
      try {
        await moveDealToStage(dealId, targetStage);
        router.refresh();
      } catch {
        setDeals(prev);
      }
    });
  }

  if (board.stages.length === 0) {
    return (
      <div>
        <Header
          board={board}
          view={view}
          onView={setView}
          onSwitch={switchPipeline}
        />
        <div
          className="grid place-items-center p-16 text-center"
          style={{ backgroundColor: "var(--kb-surface)", border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius)" }}
        >
          <p style={{ fontWeight: 600 }}>No pipeline stages yet</p>
          <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            Seed a pipeline (npm run seed:tenant -- --slug acme) to populate the board.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header board={board} view={view} onView={setView} onSwitch={switchPipeline} />

      {view === "kanban" ? (
        <>
          {/* Desktop kanban: all stage columns side by side with drag-and-drop. */}
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="hidden gap-3 overflow-x-auto pb-3 md:flex">
              {board.stages.map((stage) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  cards={dealsByStage.get(stage.id) ?? []}
                  onNew={() => setCreatingStage(stage)}
                  onOpen={setOpenDeal}
                />
              ))}
            </div>
          </DndContext>

          {/* Mobile kanban: horizontally scrolling stage tabs + a single column. */}
          <div className="md:hidden">
            <div className="mb-3 flex gap-1 overflow-x-auto pb-1">
              {board.stages.map((stage) => {
                const active = stage.id === mobileStageId;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setMobileStageId(stage.id)}
                    className="shrink-0 px-3 py-2 text-sm"
                    style={{
                      color: active ? "var(--kb-primary)" : "var(--kb-text-secondary)",
                      fontWeight: active ? 600 : 400,
                      borderBottom: active ? "2px solid var(--kb-primary)" : "2px solid transparent",
                    }}
                  >
                    {stage.name} ({(dealsByStage.get(stage.id) ?? []).length})
                  </button>
                );
              })}
            </div>
            {(() => {
              const stage = board.stages.find((s) => s.id === mobileStageId) ?? board.stages[0];
              if (!stage) return null;
              const cards = dealsByStage.get(stage.id) ?? [];
              return (
                <div className="space-y-2">
                  <KbButton variant="outline" onClick={() => setCreatingStage(stage)}>
                    <Plus size={16} /> New deal
                  </KbButton>
                  {cards.length === 0 ? (
                    <p className="p-4 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No deals in this stage.</p>
                  ) : (
                    cards.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setOpenDeal(c)}
                        className="w-full p-3 text-left"
                        style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
                      >
                        <div style={{ color: "var(--kb-text-primary)", fontWeight: 600 }}>{c.name}</div>
                        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                          <span>{c.contactName ?? ""}</span>
                          <span>{formatCurrency(c.amountCents / 100)}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        <DealList deals={deals} stages={board.stages} onOpen={setOpenDeal} />
      )}

      {creatingStage && board.activePipelineId ? (
        <NewDealModal
          pipelineId={board.activePipelineId}
          stage={creatingStage}
          allTags={allTags}
          customFields={customFields}
          onClose={() => setCreatingStage(null)}
        />
      ) : null}
      {openDeal ? (
        <RecordPane
          type="deal"
          id={openDeal.id}
          title={openDeal.name}
          subtitle={openDeal.contactName ?? undefined}
          onClose={() => setOpenDeal(null)}
          details={<DealDetails deal={openDeal} allTags={allTags} customFields={customFields} />}
        />
      ) : null}
    </div>
  );
}

function Header({
  board,
  view,
  onView,
  onSwitch,
}: {
  board: DealBoard;
  view: "kanban" | "list";
  onView: (v: "kanban" | "list") => void;
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Deals</div>
        <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Deals</h1>
      </div>
      <div className="flex items-center gap-2">
        {board.pipelines.length > 0 ? (
          <select
            value={board.activePipelineId ?? ""}
            onChange={(e) => onSwitch(e.target.value)}
            className="rounded px-2 py-1.5 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          >
            {board.pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
        <div className="flex overflow-hidden rounded" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
          {(["kanban", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              className="px-3 py-1.5 text-sm capitalize"
              style={{
                backgroundColor: view === v ? "var(--kb-primary)" : "var(--kb-surface)",
                color: view === v ? "#fff" : "var(--kb-text-secondary)",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({
  stage,
  cards,
  onNew,
  onOpen,
}: {
  stage: StageCol;
  cards: DealCard[];
  onNew: () => void;
  onOpen: (d: DealCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = cards.reduce((sum, c) => sum + c.amountCents, 0);
  const accent = stage.isWon ? "var(--kb-success)" : stage.isLost ? "var(--kb-error)" : "var(--kb-primary)";
  return (
    <div
      ref={setNodeRef}
      className="flex w-72 shrink-0 flex-col rounded"
      style={{
        backgroundColor: isOver ? "rgba(29,119,189,0.06)" : "var(--kb-surface-grey)",
        borderRadius: "var(--kb-radius)",
        borderTop: `3px solid ${accent}`,
      }}
    >
      <div className="flex items-center justify-between px-3 py-2">
        <span style={{ fontWeight: 600, color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{stage.name}</span>
        <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          {cards.length} - {formatCurrency(total / 100)}
        </span>
      </div>
      <div className="flex-1 space-y-2 px-2 pb-2">
        {cards.map((c) => (
          <Card key={c.id} deal={c} onOpen={() => onOpen(c)} />
        ))}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="m-2 flex items-center justify-center gap-1 rounded py-1.5 text-xs"
        style={{ border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-secondary)" }}
      >
        <Plus size={14} /> New Deal
      </button>
    </div>
  );
}

function Card({ deal, onOpen }: { deal: DealCard; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style: React.CSSProperties = {
    backgroundColor: "var(--kb-surface)",
    borderRadius: "var(--kb-radius-sm)",
    boxShadow: "var(--kb-shadow-card)",
    opacity: isDragging ? 0.5 : 1,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="p-3" {...attributes} {...listeners}>
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <p style={{ fontWeight: 500, color: "var(--kb-text-primary)", fontSize: "var(--kb-fs-body)" }}>{deal.name}</p>
        <p className="mt-1 text-xs" style={{ color: "var(--kb-primary)" }}>{formatCurrency(deal.amountCents / 100)}</p>
        <div className="mt-1 flex items-center justify-between text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          <span>{deal.contactName ?? "No contact"}</span>
          <span>{deal.daysInStage}d in stage</span>
        </div>
        {deal.tags.length > 0 ? <div className="mt-2"><TagChips tags={deal.tags} /></div> : null}
      </button>
    </div>
  );
}

function DealList({ deals, stages, onOpen }: { deals: DealCard[]; stages: StageCol[]; onOpen: (d: DealCard) => void }) {
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  return (
    <div
      className="overflow-hidden"
      style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
            <th className="px-3 py-2 text-left font-medium">Deal</th>
            <th className="px-3 py-2 text-left font-medium">Stage</th>
            <th className="px-3 py-2 text-left font-medium">Amount</th>
            <th className="px-3 py-2 text-left font-medium">Contact</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {deals.length === 0 ? (
            <tr><td colSpan={5} className="p-8 text-center" style={{ color: "var(--kb-text-secondary)" }}>No deals in this pipeline.</td></tr>
          ) : (
            deals.map((d) => (
              <tr key={d.id} onClick={() => onOpen(d)} className="cursor-pointer" style={{ borderTop: "1px solid var(--kb-border)", height: "var(--kb-row-h)" }}>
                <td className="px-3" style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}>{d.name}</td>
                <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{stageName.get(d.stageId) ?? "-"}</td>
                <td className="px-3" style={{ color: "var(--kb-primary)" }}>{formatCurrency(d.amountCents / 100)}</td>
                <td className="px-3" style={{ color: "var(--kb-text-secondary)" }}>{d.contactName ?? "-"}</td>
                <td className="px-3"><StatusBadge value={d.status} /></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function DealDetails({ deal, allTags, customFields }: { deal: DealCard; allTags: TagRow[]; customFields: CustomFieldDef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  useEffect(() => {
    let active = true;
    loadDealDetail(deal.id).then((d) => {
      if (!active) return;
      setTagIds(d.tagIds);
      setCfValues(d.customValues);
    });
    return () => { active = false; };
  }, [deal.id]);

  function save() {
    startTransition(async () => {
      await updateDealMeta(deal.id, { tagIds, customFields: cfValues });
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <dl className="space-y-3 text-sm">
        <Row label="Amount" value={formatCurrency(deal.amountCents / 100)} />
        <Row label="Contact" value={deal.contactName ?? "-"} />
        <Row label="Days in stage" value={`${deal.daysInStage}`} />
        <Row label="Status" value={deal.status} />
      </dl>
      <Field label="Tags"><TagPicker all={allTags} selected={tagIds} onChange={setTagIds} /></Field>
      <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
      <div className="flex gap-2 pt-2">
        <KbButton onClick={save} disabled={pending}>{pending ? "Saving..." : "Save"}</KbButton>
      </div>
      <div className="pt-2" style={{ borderTop: "1px solid var(--kb-border)" }}>
        <LineItemsSection dealId={deal.id} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: "var(--kb-text-secondary)" }}>{label}</dt>
      <dd style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{value}</dd>
    </div>
  );
}

function NewDealModal({ pipelineId, stage, allTags, customFields, onClose }: { pipelineId: string; stage: StageCol; allTags: TagRow[]; customFields: CustomFieldDef[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [cfValues, setCfValues] = useState<CustomFieldValueMap>({});

  function submit() {
    if (!name.trim()) return;
    const cents = Math.round((Number(amount) || 0) * 100);
    startTransition(async () => {
      await createDeal({ name, pipelineId, stageId: stage.id, amountCents: cents, tagIds, customFields: cfValues });
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-stretch overflow-auto sm:place-items-center sm:p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full p-5 sm:h-auto sm:max-w-sm sm:rounded"
        style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}
      >
        <h2 className="mb-1" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600 }}>New deal</h2>
        <p className="mb-4 text-xs" style={{ color: "var(--kb-text-secondary)" }}>Stage: {stage.name}</p>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Name</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Amount (USD)</span>
          <input
            value={amount}
            inputMode="decimal"
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
          />
        </label>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--kb-text-secondary)" }}>Tags</span>
            <TagPicker all={allTags} selected={tagIds} onChange={setTagIds} />
          </label>
          <CustomFieldInputs fields={customFields} values={cfValues} onChange={(id, v) => setCfValues((p) => ({ ...p, [id]: v }))} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton onClick={submit} disabled={pending || !name.trim()}>{pending ? "Creating..." : "Create deal"}</KbButton>
        </div>
      </div>
    </div>
  );
}
