"use client";

/*
 * Custom fields settings UI: a tab per CRM entity, each listing that entity's
 * fields with drag-to-reorder (@dnd-kit/sortable), plus add / edit / delete.
 * The add/edit modal auto-slugs the key from the label and only shows the
 * options editor for SELECT / MULTI_SELECT types.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  CUSTOM_FIELD_TYPES,
  ENTITY_TYPES,
  type CustomFieldDef,
  type CustomFieldType,
  type EntityType,
} from "@/lib/crm/record";
import {
  createCustomField,
  updateCustomField,
  deleteCustomField,
  reorderCustomFields,
} from "./actions";

const ENTITY_LABEL: Record<EntityType, string> = {
  LEAD: "Leads",
  DEAL: "Deals",
  CONTACT: "Contacts",
  COMPANY: "Companies",
};

const NEEDS_OPTIONS = (t: CustomFieldType) => t === "SELECT" || t === "MULTI_SELECT";

export function CustomFieldsManager({ byEntity }: { byEntity: Record<EntityType, CustomFieldDef[]> }) {
  const [tab, setTab] = useState<EntityType>("LEAD");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);

  const fields = byEntity[tab];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1">
        {ENTITY_TYPES.map((et) => (
          <button
            key={et}
            type="button"
            onClick={() => setTab(et)}
            className="rounded px-3 py-1.5 text-sm"
            style={{
              backgroundColor: tab === et ? "var(--kb-primary)" : "var(--kb-surface-grey)",
              color: tab === et ? "#fff" : "var(--kb-text-secondary)",
              borderRadius: "var(--kb-radius-sm)",
            }}
          >
            {ENTITY_LABEL[et]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {fields.length} field{fields.length === 1 ? "" : "s"} on {ENTITY_LABEL[tab]}
        </span>
        <KbButton onClick={() => setAdding(true)}><Plus size={16} /> Add field</KbButton>
      </div>

      <FieldList key={fields.map((f) => f.id).join()} entityType={tab} fields={fields} onEdit={setEditing} />

      {adding ? (
        <FieldModal entityType={tab} onClose={() => setAdding(false)} />
      ) : null}
      {editing ? (
        <FieldModal entityType={tab} field={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function FieldList({
  entityType,
  fields,
  onEdit,
}: {
  entityType: EntityType;
  fields: CustomFieldDef[];
  onEdit: (f: CustomFieldDef) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<CustomFieldDef[]>(fields);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((f) => f.id === active.id);
    const newIndex = items.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorderCustomFields(entityType, next.map((f) => f.id)).then(() => router.refresh());
  }

  if (items.length === 0) {
    return (
      <div className="grid place-items-center p-12 text-center" style={{ backgroundColor: "var(--kb-surface)", border: "1px dashed var(--kb-border)", borderRadius: "var(--kb-radius)" }}>
        <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No custom fields yet. Add one to capture extra data on these records.</p>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {items.map((f) => (
            <FieldRow key={f.id} field={f} onEdit={onEdit} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function FieldRow({ field, onEdit }: { field: CustomFieldDef; onEdit: (f: CustomFieldDef) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });

  function onDelete() {
    if (!confirm(`Delete the "${field.label}" field? Existing values will be removed.`)) return;
    startTransition(async () => {
      await deleteCustomField(field.id);
      router.refresh();
    });
  }

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-3 px-3"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        borderTop: "1px solid var(--kb-border)",
        height: "var(--kb-row-h)",
        backgroundColor: "var(--kb-surface)",
      }}
    >
      <button type="button" className="cursor-grab" style={{ color: "var(--kb-text-secondary)" }} {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <div className="flex-1">
        <span style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{field.label}</span>
        {field.required ? <span className="ml-2 text-xs" style={{ color: "var(--kb-error)" }}>required</span> : null}
        <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{field.key} - {field.type}</div>
      </div>
      <button type="button" onClick={() => onEdit(field)} style={{ color: "var(--kb-text-secondary)" }}><Pencil size={15} /></button>
      <button type="button" onClick={onDelete} disabled={pending} style={{ color: "var(--kb-error)" }}><Trash2 size={15} /></button>
    </div>
  );
}

function FieldModal({
  entityType,
  field,
  onClose,
}: {
  entityType: EntityType;
  field?: CustomFieldDef;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "TEXT");
  const [required, setRequired] = useState(field?.required ?? false);
  const [optionsText, setOptionsText] = useState((field?.options ?? []).join("\n"));

  const isEdit = Boolean(field);

  function submit() {
    if (!label.trim()) return;
    const options = NEEDS_OPTIONS(type)
      ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean)
      : undefined;
    startTransition(async () => {
      if (isEdit && field) {
        await updateCustomField(field.id, { entityType, label, type, options, required });
      } else {
        await createCustomField({ entityType, label, type, options, required });
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell title={isEdit ? "Edit field" : "Add field"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Label">
          <Text value={label} onChange={setLabel} autoFocus />
        </Field>
        <Field label="Type">
          <select
            value={type}
            disabled={isEdit}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
            className="w-full rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", opacity: isEdit ? 0.6 : 1 }}
          >
            {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        {NEEDS_OPTIONS(type) ? (
          <Field label="Options (one per line)">
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={4}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--kb-text-primary)" }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
        <KbButton onClick={submit} disabled={pending || !label.trim()}>
          {pending ? "Saving..." : isEdit ? "Save field" : "Add field"}
        </KbButton>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto p-4" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5" style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-modal)" }}>
        <h2 className="mb-4" style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{title}</h2>
        {children}
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

function Text({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input value={value} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} className="w-full rounded px-3 py-2 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
  );
}
