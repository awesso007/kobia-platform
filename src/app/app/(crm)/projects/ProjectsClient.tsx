"use client";

/*
 * Projects list (Sprint 11). Card/table toggle, status/owner filters, and a
 * create modal whose key auto-suggests from the name. Bitrix24-style cards with
 * a color stripe, progress bar, status pill, and member count.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, Table2, Plus, Search } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_VISIBILITIES, projectKeyFromName } from "@/lib/projects/shared";
import type { ProjectListRow } from "@/lib/projects/queries";
import { createProject } from "./actions";

type Member = { clerkUserId: string; displayName: string | null; email: string | null };

const STATUS_COLOR: Record<string, string> = {
  PLANNING: "#7d4aea",
  ACTIVE: "#1d77bd",
  ON_HOLD: "#f0ad4e",
  COMPLETED: "#5cb85c",
  ARCHIVED: "#828282",
};

function memberLabel(m: Member | undefined): string {
  if (!m) return "Unknown";
  return m.displayName ?? m.email ?? m.clerkUserId;
}

export function ProjectsClient({ projects, members }: { projects: ProjectListRow[]; members: Member[] }) {
  const [view, setView] = useState<"cards" | "table">("cards");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const memberById = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.clerkUserId, x);
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (ownerFilter && p.ownerClerkUserId !== ownerFilter) return false;
      if (q && !`${p.name} ${p.key}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [projects, statusFilter, ownerFilter, q]);

  return (
    <div className="kobia-crm p-6" style={{ background: "var(--kb-page-bg)", minHeight: "100%" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 style={{ fontSize: "var(--kb-fs-h1)", color: "var(--kb-text-primary)", fontWeight: 600 }}>Projects</h1>
        <KbButton variant="primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New project
        </KbButton>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded border bg-white px-2" style={{ borderColor: "var(--kb-border)" }}>
          <Search size={14} color="var(--kb-text-secondary)" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search projects"
            className="py-1.5 text-sm outline-none"
            style={{ minWidth: 180 }}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="rounded border bg-white px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
          <option value="">All owners</option>
          {members.map((m) => (
            <option key={m.clerkUserId} value={m.clerkUserId}>{memberLabel(m)}</option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded border bg-white p-0.5" style={{ borderColor: "var(--kb-border)" }}>
          <button onClick={() => setView("cards")} className="rounded p-1.5" style={{ background: view === "cards" ? "var(--kb-surface-grey)" : "transparent" }} aria-label="Card view">
            <LayoutGrid size={16} color="var(--kb-text-secondary)" />
          </button>
          <button onClick={() => setView("table")} className="rounded p-1.5" style={{ background: view === "table" ? "var(--kb-surface-grey)" : "transparent" }} aria-label="Table view">
            <Table2 size={16} color="var(--kb-text-secondary)" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded border bg-white p-10 text-center text-sm" style={{ borderColor: "var(--kb-border)", color: "var(--kb-text-secondary)" }}>
          No projects yet. Create your first project to get started.
        </div>
      ) : view === "cards" ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {filtered.map((p) => (
            <ProjectCard key={p.id} project={p} ownerName={memberLabel(memberById.get(p.ownerClerkUserId ?? ""))} />
          ))}
        </div>
      ) : (
        <ProjectTable projects={filtered} memberById={memberById} />
      )}

      {showCreate && <CreateProjectModal members={members} onClose={() => setShowCreate(false)} />}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--kb-surface-grey)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--kb-primary)" }} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#828282";
  return (
    <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium" style={{ background: `${color}1a`, color }}>
      {PROJECT_STATUS_LABELS[status as keyof typeof PROJECT_STATUS_LABELS] ?? status}
    </span>
  );
}

function ProjectCard({ project, ownerName }: { project: ProjectListRow; ownerName: string }) {
  return (
    <Link href={`/app/projects/${project.id}`} className="block overflow-hidden rounded border bg-white transition-shadow hover:shadow-md" style={{ borderColor: "var(--kb-border)", boxShadow: "var(--kb-shadow-card)" }}>
      <div style={{ height: 4, background: project.color ?? "var(--kb-primary)" }} />
      <div className="p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold tracking-wide" style={{ color: "var(--kb-text-secondary)" }}>{project.key}</span>
          <StatusPill status={project.status} />
        </div>
        <div className="mb-2 truncate text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>{project.name}</div>
        <div className="mb-1 flex items-center justify-between text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>
          <span>{project.progressPct}% complete</span>
          <span>{project.taskCount} tasks</span>
        </div>
        <ProgressBar pct={project.progressPct} />
        <div className="mt-3 flex items-center justify-between text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>
          <span className="truncate">{ownerName}</span>
          <span>{project.memberCount} members</span>
        </div>
      </div>
    </Link>
  );
}

function ProjectTable({ projects, memberById }: { projects: ProjectListRow[]; memberById: Map<string, Member> }) {
  return (
    <div className="overflow-hidden rounded border bg-white" style={{ borderColor: "var(--kb-border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
            <th className="px-3 py-2 text-left font-medium">Key</th>
            <th className="px-3 py-2 text-left font-medium">Name</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Owner</th>
            <th className="px-3 py-2 text-left font-medium">Progress</th>
            <th className="px-3 py-2 text-left font-medium">Tasks</th>
            <th className="px-3 py-2 text-left font-medium">Members</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-t" style={{ borderColor: "var(--kb-border)" }}>
              <td className="px-3 py-2"><span className="font-mono text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{p.key}</span></td>
              <td className="px-3 py-2"><Link href={`/app/projects/${p.id}`} className="font-medium" style={{ color: "var(--kb-primary)" }}>{p.name}</Link></td>
              <td className="px-3 py-2"><StatusPill status={p.status} /></td>
              <td className="px-3 py-2">{memberById.get(p.ownerClerkUserId ?? "")?.displayName ?? memberById.get(p.ownerClerkUserId ?? "")?.email ?? "-"}</td>
              <td className="px-3 py-2" style={{ width: 140 }}><div className="flex items-center gap-2"><ProgressBar pct={p.progressPct} /><span className="text-[11px]">{p.progressPct}%</span></div></td>
              <td className="px-3 py-2">{p.taskCount}</td>
              <td className="px-3 py-2">{p.memberCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateProjectModal({ members, onClose }: { members: Member[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("PLANNING");
  const [visibility, setVisibility] = useState("TEAM");
  const [owner, setOwner] = useState(members[0]?.clerkUserId ?? "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : projectKeyFromName(name);

  function submit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const id = await createProject({
          name: name.trim(),
          description: description.trim() || undefined,
          status,
          visibility,
          ownerClerkUserId: owner || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          memberClerkUserIds: selectedMembers,
        });
        router.push(`/app/projects/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to create project.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded bg-white p-5" style={{ boxShadow: "var(--kb-shadow-modal)" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-semibold" style={{ color: "var(--kb-text-primary)" }}>New project</h2>
        <div className="space-y-3">
          <Field label="Name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
          </Field>
          <Field label="Key">
            <input value={effectiveKey} onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} className="w-full rounded border px-2 py-1.5 font-mono text-sm" style={{ borderColor: "var(--kb-border)" }} />
          </Field>
          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="Visibility">
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
                {PROJECT_VISIBILITIES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
            </Field>
            <Field label="End date">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }} />
            </Field>
          </div>
          <Field label="Owner">
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--kb-border)" }}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.clerkUserId} value={m.clerkUserId}>{memberLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="Initial members">
            <div className="max-h-28 space-y-1 overflow-auto rounded border p-2" style={{ borderColor: "var(--kb-border)" }}>
              {members.map((m) => (
                <label key={m.clerkUserId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(m.clerkUserId)}
                    onChange={(e) => setSelectedMembers((cur) => (e.target.checked ? [...cur, m.clerkUserId] : cur.filter((x) => x !== m.clerkUserId)))}
                  />
                  {memberLabel(m)}
                </label>
              ))}
            </div>
          </Field>
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: "var(--kb-error)" }}>{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <KbButton variant="outline" onClick={onClose}>Cancel</KbButton>
          <KbButton variant="primary" onClick={submit} disabled={pending}>{pending ? "Creating..." : "Create project"}</KbButton>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium" style={{ color: "var(--kb-text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}
