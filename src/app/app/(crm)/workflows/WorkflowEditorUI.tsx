"use client";

/*
 * Visual workflow editor (Sprint 18). Uses reactflow for the canvas plus a node
 * palette and a right-hand settings panel. Persists graph json via PATCH.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  NODE_TYPES,
  nodeTypeDef,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowEdge,
} from "@/lib/workflows/workflow-utils";

type EditorProps = {
  workflowId: string;
  name: string;
  description: string | null;
  entryTriggerType: string;
  status: string;
  graph: WorkflowGraph;
};

function toRfNodes(graph: WorkflowGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: "default",
    position: n.position ?? { x: 0, y: 0 },
    data: { label: nodeTypeDef(n.type)?.label ?? n.type, nodeType: n.type, cfg: n.data },
  }));
}
function toRfEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, label: e.sourceHandle }));
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function WorkflowEditor(props: EditorProps) {
  const router = useRouter();
  const [nodes, setNodes] = useState<Node[]>(() => toRfNodes(props.graph));
  const [edges, setEdges] = useState<Edge[]>(() => toRfEdges(props.graph));
  const [name, setName] = useState(props.name);
  const [description, setDescription] = useState(props.description ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [status, setStatus] = useState(props.status);
  const [dirty, setDirty] = useState(false);

  const selected = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      setDirty(true);
    },
    []
  );
  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setDirty(true);
  }, []);
  const onConnect: OnConnect = useCallback((conn) => {
    setEdges((eds) => addEdge({ ...conn, id: makeId("e") }, eds));
    setDirty(true);
  }, []);

  function addNode(nodeType: string) {
    const id = makeId("n");
    const label = nodeTypeDef(nodeType)?.label ?? nodeType;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "default",
        position: { x: 120 + Math.random() * 200, y: 80 + Math.random() * 300 },
        data: { label, nodeType, cfg: {} },
      },
    ]);
    setDirty(true);
  }

  function updateSelectedField(key: string, value: string) {
    if (!selectedId) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId
          ? { ...n, data: { ...n.data, cfg: { ...(n.data.cfg ?? {}), [key]: value } } }
          : n
      )
    );
    setDirty(true);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  function currentGraph(): WorkflowGraph {
    const gnodes: WorkflowNode[] = nodes.map((n) => ({
      id: n.id,
      type: (n.data.nodeType as string) ?? "action.send_email",
      data: (n.data.cfg as Record<string, unknown>) ?? {},
      position: n.position,
    }));
    const gedges: WorkflowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: typeof e.label === "string" ? e.label : undefined,
    }));
    return { nodes: gnodes, edges: gedges };
  }

  function save() {
    startSave(async () => {
      const res = await fetch(`/api/workflows/${props.workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, graph: currentGraph() }),
      });
      if (res.ok) {
        setDirty(false);
        router.refresh();
      } else {
        alert("Save failed: " + (await res.text()));
      }
    });
  }

  function togglePublish() {
    const next = status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    startPublish(async () => {
      const res = await fetch(`/api/workflows/${props.workflowId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setStatus(next);
        router.refresh();
      } else {
        alert("Publish failed: " + (await res.text()));
      }
    });
  }

  function testRun() {
    startSave(async () => {
      const res = await fetch(`/api/workflows/${props.workflowId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: { test: true } }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/app/workflows/${props.workflowId}/runs/${data.runId}`);
      } else {
        alert("Test run failed: " + (await res.text()));
      }
    });
  }

  const groups = ["Triggers", "Actions", "Logic"] as const;

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      <div
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ borderColor: "var(--kb-border)", backgroundColor: "var(--kb-surface)" }}
      >
        <div className="flex items-center gap-3">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            className="rounded px-2 py-1 text-lg font-semibold"
            style={{ border: "1px solid transparent", backgroundColor: "transparent", color: "var(--kb-text-primary)" }}
          />
          <span className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            {props.entryTriggerType}
          </span>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-medium"
            style={{
              color: status === "ACTIVE" ? "#059669" : "#d97706",
              backgroundColor: status === "ACTIVE" ? "#05966922" : "#d9770622",
            }}
          >
            {status}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={testRun}
            disabled={isSaving || dirty}
            className="rounded px-3 py-1.5 text-sm"
            style={{ border: "1px solid var(--kb-border)" }}
            title={dirty ? "Save first" : "Run a test with sample payload"}
          >
            Test run
          </button>
          <button
            onClick={togglePublish}
            disabled={isPublishing}
            className="rounded px-3 py-1.5 text-sm"
            style={{ border: "1px solid var(--kb-border)" }}
          >
            {status === "ACTIVE" ? "Pause" : "Publish"}
          </button>
          <button
            onClick={save}
            disabled={isSaving || !dirty}
            className="rounded px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--kb-primary)" }}
          >
            {isSaving ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="w-56 overflow-y-auto border-r p-3"
          style={{ borderColor: "var(--kb-border)", backgroundColor: "var(--kb-surface)" }}
        >
          <p className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
            Add node
          </p>
          {groups.map((g) => (
            <div key={g} className="mb-4">
              <p className="mb-1 text-xs font-semibold" style={{ color: "var(--kb-text-primary)" }}>
                {g}
              </p>
              <div className="space-y-1">
                {NODE_TYPES.filter((t) => t.group === g).map((t) => (
                  <button
                    key={t.type}
                    onClick={() => addNode(t.type)}
                    className="block w-full rounded px-2 py-1 text-left text-xs"
                    style={{ border: "1px solid var(--kb-border)" }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>
        <main className="flex-1" style={{ backgroundColor: "var(--kb-bg)" }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </main>
        <aside
          className="w-80 overflow-y-auto border-l p-3"
          style={{ borderColor: "var(--kb-border)", backgroundColor: "var(--kb-surface)" }}
        >
          {!selected ? (
            <div>
              <p className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
                Workflow
              </p>
              <label className="block text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDirty(true);
                }}
                rows={4}
                className="mt-1 w-full rounded px-2 py-1 text-sm"
                style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
              />
              <p className="mt-4 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                Select a node to edit its settings.
              </p>
            </div>
          ) : (
            <SelectedPanel
              key={selected.id}
              nodeType={(selected.data.nodeType as string) ?? ""}
              cfg={(selected.data.cfg as Record<string, string>) ?? {}}
              onChange={updateSelectedField}
              onDelete={deleteSelected}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function SelectedPanel({
  nodeType,
  cfg,
  onChange,
  onDelete,
}: {
  nodeType: string;
  cfg: Record<string, string>;
  onChange: (k: string, v: string) => void;
  onDelete: () => void;
}) {
  const def = nodeTypeDef(nodeType);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          {def?.label ?? nodeType}
        </p>
        <button
          onClick={onDelete}
          className="rounded px-2 py-0.5 text-xs"
          style={{ border: "1px solid #dc2626", color: "#dc2626" }}
        >
          Delete
        </button>
      </div>
      {def && def.fields.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          No settings.
        </p>
      ) : null}
      {def?.fields.map((f) => (
        <div key={f.key} className="mb-3">
          <label className="block text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            {f.label}
          </label>
          {f.kind === "textarea" ? (
            <textarea
              value={cfg[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              rows={3}
              className="mt-1 w-full rounded px-2 py-1 text-sm"
              style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
            />
          ) : f.kind === "select" && f.options ? (
            <select
              value={cfg[f.key] ?? f.options[0]}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="mt-1 w-full rounded px-2 py-1 text-sm"
              style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
            >
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.kind === "number" ? "number" : "text"}
              value={cfg[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="mt-1 w-full rounded px-2 py-1 text-sm"
              style={{ border: "1px solid var(--kb-border)", backgroundColor: "var(--kb-bg)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
