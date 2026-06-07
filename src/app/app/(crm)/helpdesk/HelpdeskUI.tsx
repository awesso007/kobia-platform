"use client";

/*
 * Helpdesk client components (Sprint 15). This file is "use client" and exports
 * ONLY React components. All pure utilities live in helpdesk-utils.ts (no "use
 * client") so server pages can import them without turning them into
 * client-reference proxies, which crash at SSR in production. Do not add
 * non-component exports here.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  statusClass,
  priorityClass,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
} from "./helpdesk-utils";
import {
  createTicket,
  replyToTicket,
  setTicketStatus,
  setTicketPriority,
  setTicketAssignment,
  createTeam,
  deleteTeam,
  createCategory,
  deleteCategory,
  createSlaPolicy,
  deleteSlaPolicy,
  saveKbArticle,
  deleteKbArticle,
  createKbCategory,
  deleteKbCategory,
} from "./actions";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const HELPDESK_TABS = [
  { href: "/app/helpdesk", label: "Dashboard" },
  { href: "/app/helpdesk/tickets", label: "Tickets" },
  { href: "/app/helpdesk/kb", label: "Knowledge base" },
  { href: "/app/helpdesk/teams", label: "Teams" },
  { href: "/app/helpdesk/categories", label: "Categories" },
  { href: "/app/helpdesk/sla", label: "SLA" },
];

export function HelpdeskTabs({ active }: { active: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
      {HELPDESK_TABS.map((t) => {
        const isActive = active === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(status)}`}>
      {status}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${priorityClass(priority)}`}>
      {priority}
    </span>
  );
}

type Option = { id: string; name: string };

export function NewTicketForm({
  teams,
  categories,
  slaPolicies,
}: {
  teams: Option[];
  categories: Option[];
  slaPolicies: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    subject: "",
    description: "",
    priority: "NORMAL",
    requesterName: "",
    requesterEmail: "",
    teamId: "",
    categoryId: "",
    slaPolicyId: "",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setErr(null);
    start(async () => {
      try {
        const id = await createTicket({
          subject: form.subject,
          description: form.description,
          priority: form.priority as never,
          requesterName: form.requesterName,
          requesterEmail: form.requesterEmail,
          teamId: form.teamId || null,
          categoryId: form.categoryId || null,
          slaPolicyId: form.slaPolicyId || null,
        });
        router.push(`/app/helpdesk/tickets/${id}`);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to create ticket.");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      {err ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      <Field label="Subject">
        <input className={inputCls} value={form.subject} onChange={(e) => set("subject", e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea className={inputCls} rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Requester name">
          <input className={inputCls} value={form.requesterName} onChange={(e) => set("requesterName", e.target.value)} />
        </Field>
        <Field label="Requester email">
          <input className={inputCls} value={form.requesterEmail} onChange={(e) => set("requesterEmail", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority">
          <select className={inputCls} value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Team">
          <select className={inputCls} value={form.teamId} onChange={(e) => set("teamId", e.target.value)}>
            <option value="">Unassigned</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <select className={inputCls} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="SLA policy">
          <select className={inputCls} value={form.slaPolicyId} onChange={(e) => set("slaPolicyId", e.target.value)}>
            <option value="">From category / none</option>
            {slaPolicies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <button className={btnPrimary} disabled={pending} onClick={submit}>
        {pending ? "Creating..." : "Create ticket"}
      </button>
    </div>
  );
}

export function TicketControls({
  ticketId,
  status,
  priority,
  teamId,
  teams,
}: {
  ticketId: string;
  status: string;
  priority: string;
  teamId: string | null;
  teams: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh(); });

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Status</span>
        <select
          className={inputCls}
          value={status}
          disabled={pending}
          onChange={(e) => run(() => setTicketStatus(ticketId, e.target.value as never))}
        >
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Priority</span>
        <select
          className={inputCls}
          value={priority}
          disabled={pending}
          onChange={(e) => run(() => setTicketPriority(ticketId, e.target.value as never))}
        >
          {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Team</span>
        <select
          className={inputCls}
          value={teamId ?? ""}
          disabled={pending}
          onChange={(e) => run(() => setTicketAssignment(ticketId, { teamId: e.target.value || null }))}
        >
          <option value="">Unassigned</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
    </div>
  );
}

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  function submit() {
    if (!body.trim()) return;
    start(async () => {
      await replyToTicket({ ticketId, bodyHtml: body, isInternal: internal });
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        className={inputCls}
        rows={4}
        placeholder={internal ? "Internal note (not visible to the customer)" : "Reply to the customer"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
          Internal note
        </label>
        <button className={btnPrimary} disabled={pending || !body.trim()} onClick={submit}>
          {pending ? "Sending..." : internal ? "Add note" : "Send reply"}
        </button>
      </div>
    </div>
  );
}

export function TeamManager({ teams }: { teams: Array<{ id: string; name: string; description: string | null }> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button
          className={btnPrimary}
          disabled={pending || !name.trim()}
          onClick={() => start(async () => { await createTeam({ name, description: desc }); setName(""); setDesc(""); router.refresh(); })}
        >
          Add
        </button>
      </div>
      <ul className="divide-y rounded border">
        {teams.map((t) => (
          <li key={t.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="font-medium text-slate-800">{t.name}</p>
              {t.description ? <p className="text-sm text-slate-500">{t.description}</p> : null}
            </div>
            <button className={btnDanger} disabled={pending} onClick={() => start(async () => { await deleteTeam(t.id); router.refresh(); })}>
              Delete
            </button>
          </li>
        ))}
        {teams.length === 0 ? <li className="px-3 py-4 text-sm text-slate-500">No teams yet.</li> : null}
      </ul>
    </div>
  );
}

export function CategoryManager({
  categories,
  slaPolicies,
}: {
  categories: Array<{ id: string; name: string; color: string | null; slaPolicy: { name: string } | null }>;
  slaPolicies: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [slaPolicyId, setSla] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls} value={slaPolicyId} onChange={(e) => setSla(e.target.value)}>
          <option value="">No SLA</option>
          {slaPolicies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          className={btnPrimary}
          disabled={pending || !name.trim()}
          onClick={() => start(async () => { await createCategory({ name, slaPolicyId: slaPolicyId || null }); setName(""); setSla(""); router.refresh(); })}
        >
          Add
        </button>
      </div>
      <ul className="divide-y rounded border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="font-medium text-slate-800">{c.name}</p>
              <p className="text-sm text-slate-500">SLA: {c.slaPolicy?.name ?? "none"}</p>
            </div>
            <button className={btnDanger} disabled={pending} onClick={() => start(async () => { await deleteCategory(c.id); router.refresh(); })}>
              Delete
            </button>
          </li>
        ))}
        {categories.length === 0 ? <li className="px-3 py-4 text-sm text-slate-500">No categories yet.</li> : null}
      </ul>
    </div>
  );
}

export function SlaManager({
  policies,
}: {
  policies: Array<{ id: string; name: string; firstResponseMinutes: number; resolveMinutes: number; businessHoursOnly: boolean }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", first: "60", resolve: "1440", biz: false });
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <input className={inputCls} placeholder="Policy name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <input className={inputCls} type="number" placeholder="First response (min)" value={form.first} onChange={(e) => setForm((f) => ({ ...f, first: e.target.value }))} />
        <input className={inputCls} type="number" placeholder="Resolve (min)" value={form.resolve} onChange={(e) => setForm((f) => ({ ...f, resolve: e.target.value }))} />
        <button
          className={btnPrimary}
          disabled={pending || !form.name.trim()}
          onClick={() => start(async () => {
            await createSlaPolicy({
              name: form.name,
              firstResponseMinutes: Number(form.first) || 60,
              resolveMinutes: Number(form.resolve) || 1440,
              businessHoursOnly: form.biz,
            });
            setForm({ name: "", first: "60", resolve: "1440", biz: false });
            router.refresh();
          })}
        >
          Add
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={form.biz} onChange={(e) => setForm((f) => ({ ...f, biz: e.target.checked }))} />
        Business hours only (Mon-Fri 9-5)
      </label>
      <ul className="divide-y rounded border">
        {policies.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="font-medium text-slate-800">{p.name}</p>
              <p className="text-sm text-slate-500">
                First response {p.firstResponseMinutes}m / resolve {p.resolveMinutes}m{p.businessHoursOnly ? " (business hours)" : ""}
              </p>
            </div>
            <button className={btnDanger} disabled={pending} onClick={() => start(async () => { await deleteSlaPolicy(p.id); router.refresh(); })}>
              Delete
            </button>
          </li>
        ))}
        {policies.length === 0 ? <li className="px-3 py-4 text-sm text-slate-500">No SLA policies yet.</li> : null}
      </ul>
    </div>
  );
}

export function KbEditor({
  article,
  categories,
}: {
  article: { id: string; title: string; bodyHtml: string; summary: string | null; categoryId: string | null; status: string; visibility: string } | null;
  categories: Option[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: article?.title ?? "",
    summary: article?.summary ?? "",
    bodyHtml: article?.bodyHtml ?? "",
    categoryId: article?.categoryId ?? "",
    status: article?.status ?? "DRAFT",
    visibility: article?.visibility ?? "PUBLIC",
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setErr(null);
    start(async () => {
      try {
        const id = await saveKbArticle({
          id: article?.id,
          title: form.title,
          summary: form.summary,
          bodyHtml: form.bodyHtml,
          categoryId: form.categoryId || null,
          status: form.status as never,
          visibility: form.visibility as never,
        });
        router.push(`/app/helpdesk/kb/${id}`);
        router.refresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to save article.");
      }
    });
  }

  return (
    <div className="max-w-3xl space-y-4">
      {err ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p> : null}
      <Field label="Title">
        <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Summary">
        <input className={inputCls} value={form.summary} onChange={(e) => set("summary", e.target.value)} />
      </Field>
      <Field label="Body (HTML)">
        <textarea className={`${inputCls} font-mono`} rows={12} value={form.bodyHtml} onChange={(e) => set("bodyHtml", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Category">
          <select className={inputCls} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
            <option value="">None</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputCls} value={form.status} onChange={(e) => set("status", e.target.value)}>
            {["DRAFT", "PUBLISHED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Visibility">
          <select className={inputCls} value={form.visibility} onChange={(e) => set("visibility", e.target.value)}>
            {["PUBLIC", "INTERNAL", "AUTHENTICATED"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={pending} onClick={submit}>
          {pending ? "Saving..." : "Save article"}
        </button>
        {article ? (
          <button
            className={btnDanger}
            disabled={pending}
            onClick={() => start(async () => { await deleteKbArticle(article.id); router.push("/app/helpdesk/kb"); router.refresh(); })}
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function KbCategoryManager({
  categories,
}: {
  categories: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className={inputCls} placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className={btnPrimary}
          disabled={pending || !name.trim()}
          onClick={() => start(async () => { await createKbCategory({ name }); setName(""); router.refresh(); })}
        >
          Add
        </button>
      </div>
      <ul className="divide-y rounded border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-3 py-2">
            <div>
              <p className="font-medium text-slate-800">{c.name}</p>
              <p className="text-sm text-slate-500">/{c.slug}</p>
            </div>
            <button className={btnDanger} disabled={pending} onClick={() => start(async () => { await deleteKbCategory(c.id); router.refresh(); })}>
              Delete
            </button>
          </li>
        ))}
        {categories.length === 0 ? <li className="px-3 py-4 text-sm text-slate-500">No categories yet.</li> : null}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

const inputCls = "w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none";
const btnPrimary = "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const btnDanger = "rounded border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50";
