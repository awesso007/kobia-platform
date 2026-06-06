"use client";

/*
 * Product category tree manager: render the parentId tree, add a root or child
 * category, rename inline, and delete (children re-parent to the deleted node's
 * parent, handled server-side).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { createCategory, renameCategory, deleteCategory } from "../actions";

export type CategoryNode = { id: string; name: string; parentId: string | null; sortOrder: number };

type TreeNode = CategoryNode & { children: TreeNode[] };

function buildTree(nodes: CategoryNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const n of nodes) map.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) map.get(n.parentId)!.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export function CategoriesManager({ nodes }: { nodes: CategoryNode[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rootName, setRootName] = useState("");

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  function addRoot() {
    if (!rootName.trim()) return;
    startTransition(async () => {
      await createCategory({ name: rootName });
      setRootName("");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/app/settings/products" className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <ArrowLeft size={15} /> Back to products
        </Link>
        <div className="flex items-end gap-2">
          <input
            value={rootName}
            onChange={(e) => setRootName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addRoot(); }}
            placeholder="New top-level category"
            className="rounded px-3 py-2 text-sm outline-none"
            style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", minWidth: 220 }}
          />
          <KbButton onClick={addRoot} disabled={pending || !rootName.trim()}><Plus size={16} /> Add</KbButton>
        </div>
      </div>

      <div style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
        {tree.length === 0 ? (
          <div className="p-8 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>No categories yet. Add one above.</div>
        ) : (
          <div className="p-2">
            {tree.map((n) => <NodeRow key={n.id} node={n} depth={0} pending={pending} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function NodeRow({ node, depth, pending }: { node: TreeNode; depth: number; pending: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(node.name);
  const [adding, setAdding] = useState(false);
  const [childName, setChildName] = useState("");

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      await renameCategory(node.id, name);
      setEditing(false);
      router.refresh();
    });
  }

  function addChild() {
    if (!childName.trim()) return;
    startTransition(async () => {
      await createCategory({ name: childName, parentId: node.id });
      setChildName("");
      setAdding(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm(`Delete "${node.name}"? Any child categories will move up to its parent.`)) return;
    startTransition(async () => {
      await deleteCategory(node.id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-[var(--kb-surface-grey)]" style={{ paddingLeft: 8 + depth * 20 }}>
        {editing ? (
          <>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }} className="rounded px-2 py-1 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
            <button type="button" onClick={save} style={{ color: "var(--kb-success)" }}><Check size={15} /></button>
            <button type="button" onClick={() => { setEditing(false); setName(node.name); }} style={{ color: "var(--kb-text-secondary)" }}><X size={15} /></button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm" style={{ color: "var(--kb-text-primary)" }}>{node.name}</span>
            <button type="button" onClick={() => setAdding((v) => !v)} title="Add child" style={{ color: "var(--kb-text-secondary)" }}><Plus size={15} /></button>
            <button type="button" onClick={() => setEditing(true)} style={{ color: "var(--kb-text-secondary)" }}><Pencil size={14} /></button>
            <button type="button" onClick={onDelete} disabled={pending} style={{ color: "var(--kb-error)" }}><Trash2 size={14} /></button>
          </>
        )}
      </div>
      {adding ? (
        <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: 8 + (depth + 1) * 20 }}>
          <input value={childName} autoFocus onChange={(e) => setChildName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addChild(); if (e.key === "Escape") setAdding(false); }} placeholder="Child category" className="rounded px-2 py-1 text-sm outline-none" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }} />
          <button type="button" onClick={addChild} style={{ color: "var(--kb-success)" }}><Check size={15} /></button>
          <button type="button" onClick={() => { setAdding(false); setChildName(""); }} style={{ color: "var(--kb-text-secondary)" }}><X size={15} /></button>
        </div>
      ) : null}
      {node.children.map((c) => <NodeRow key={c.id} node={c} depth={depth + 1} pending={pending} />)}
    </div>
  );
}
