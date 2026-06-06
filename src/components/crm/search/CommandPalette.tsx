"use client";

/*
 * Command palette (Sprint 9). Cmd+K / Ctrl+K opens a centered 640px modal with a
 * search input and grouped results (Leads / Deals / Contacts / Companies /
 * Activities / Files / Emails) plus a "Jump to..." section of route shortcuts.
 *
 * The palette never queries Postgres directly - it POSTs the query to
 * /api/search (server-rendered) and renders the JSON. Record results navigate to
 * the entity list with ?open=<id> so the list auto-opens its RecordPane; file
 * results fetch a download URL and open it in a new tab.
 *
 * Keyboard: arrows move the active row, Enter opens it, Esc closes, Cmd+K
 * toggles. Recent searches persist in localStorage (top 5).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { getDownloadUrl } from "@/app/app/(crm)/file-actions";

type Hit = { entityType: string; entityId: string; title: string; subtitle: string | null };
type Group = { entityType: string; hits: Hit[] };
type JumpTo = { label: string; href: string };
type SearchResponse = { ok: boolean; groups?: Group[]; jumpTo?: JumpTo[] };

const GROUP_LABELS: Record<string, string> = {
  LEAD: "Leads",
  DEAL: "Deals",
  CONTACT: "Contacts",
  COMPANY: "Companies",
  ACTIVITY: "Activities",
  FILE: "Files",
  EMAIL_MESSAGE: "Emails",
  NOTE: "Notes",
};

const ROUTE_BY_TYPE: Record<string, string> = {
  LEAD: "/app/leads",
  DEAL: "/app/deals",
  CONTACT: "/app/contacts",
  COMPANY: "/app/companies",
  ACTIVITY: "/app/activities",
};

const RECENT_KEY = "kobia.search.recent";

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr.filter((x) => typeof x === "string") as string[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(q: string) {
  if (typeof window === "undefined") return;
  const trimmed = q.trim();
  if (!trimmed) return;
  const next = [trimmed, ...loadRecent().filter((x) => x !== trimmed)].slice(0, 5);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}

/* A flat row in the rendered list: either a record/file hit or a jump-to link. */
type Row =
  | { kind: "hit"; hit: Hit }
  | { kind: "jump"; jump: JumpTo };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [jumpTo, setJumpTo] = useState<JumpTo[]>([]);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqSeq = useRef(0);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setGroups([]);
    setJumpTo([]);
    setActive(0);
  }, []);

  // Cmd+K / Ctrl+K toggles the palette from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("kobia:open-search", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kobia:open-search", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      // focus after paint
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Debounced search against the server route.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const seq = ++reqSeq.current;
    if (!term) {
      setGroups([]);
      setJumpTo([]);
      setActive(0);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: term }),
        });
        const data = (await res.json()) as SearchResponse;
        if (seq !== reqSeq.current) return; // a newer query superseded this one
        setGroups(data.groups ?? []);
        setJumpTo(data.jumpTo ?? []);
        setActive(0);
      } catch {
        if (seq !== reqSeq.current) return;
        setGroups([]);
        setJumpTo([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  // Flattened, ordered list of selectable rows (hits first, then jump-to).
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groups) for (const h of g.hits) out.push({ kind: "hit", hit: h });
    for (const j of jumpTo) out.push({ kind: "jump", jump: j });
    return out;
  }, [groups, jumpTo]);

  const openRow = useCallback(
    async (row: Row) => {
      pushRecent(q);
      if (row.kind === "jump") {
        close();
        router.push(row.jump.href);
        return;
      }
      const { entityType, entityId } = row.hit;
      if (entityType === "FILE") {
        close();
        const r = await getDownloadUrl(entityId, true);
        if (r.ok && r.url) window.open(r.url, "_blank");
        return;
      }
      if (entityType === "EMAIL_MESSAGE") {
        close();
        router.push("/app/messages");
        return;
      }
      const route = ROUTE_BY_TYPE[entityType];
      if (route) {
        close();
        router.push(`${route}?open=${encodeURIComponent(entityId)}`);
      }
    },
    [close, q, router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) void openRow(row);
    }
  }

  if (!open) return null;

  let rowIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center"
      style={{ backgroundColor: "rgba(15,23,42,0.45)", paddingTop: "12vh" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="w-full overflow-hidden"
        style={{
          maxWidth: 640,
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
          boxShadow: "var(--kb-shadow-card)",
        }}
      >
        <div className="flex items-center gap-2 px-4" style={{ borderBottom: "1px solid var(--kb-border)" }}>
          <Search size={18} style={{ color: "var(--kb-text-secondary)" }} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search leads, deals, contacts, files..."
            className="flex-1 bg-transparent py-3 text-sm outline-none"
            style={{ color: "var(--kb-text-primary)" }}
          />
          <kbd className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)" }}>
            Esc
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-auto py-2">
          {q.trim() === "" ? (
            <RecentList
              recent={recent}
              onPick={(term) => setQ(term)}
            />
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              No results for &quot;{q.trim()}&quot;
            </p>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.entityType} className="mb-1">
                  <GroupHeader label={GROUP_LABELS[g.entityType] ?? g.entityType} />
                  {g.hits.map((h) => {
                    rowIndex++;
                    const idx = rowIndex;
                    return (
                      <ResultRow
                        key={`${h.entityType}:${h.entityId}`}
                        active={idx === active}
                        title={h.title}
                        subtitle={h.subtitle}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => void openRow({ kind: "hit", hit: h })}
                      />
                    );
                  })}
                </div>
              ))}
              {jumpTo.length > 0 ? (
                <div className="mb-1">
                  <GroupHeader label="Jump to..." />
                  {jumpTo.map((j) => {
                    rowIndex++;
                    const idx = rowIndex;
                    return (
                      <ResultRow
                        key={j.href}
                        active={idx === active}
                        title={j.label}
                        subtitle={j.href}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => void openRow({ kind: "jump", jump: j })}
                      />
                    );
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <div
      className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: "var(--kb-text-secondary)" }}
    >
      {label}
    </div>
  );
}

function ResultRow({
  active,
  title,
  subtitle,
  onMouseEnter,
  onClick,
}: {
  active: boolean;
  title: string;
  subtitle: string | null;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left"
      style={{ backgroundColor: active ? "var(--kb-surface-grey)" : "transparent" }}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm" style={{ color: "var(--kb-text-primary)" }}>
          {title}
        </span>
        {subtitle ? (
          <span className="block truncate text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {active ? <CornerDownLeft size={14} style={{ color: "var(--kb-text-secondary)" }} /> : null}
    </button>
  );
}

function RecentList({ recent, onPick }: { recent: string[]; onPick: (term: string) => void }) {
  if (recent.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Type to search across leads, deals, contacts, companies, activities, files, and emails.
      </p>
    );
  }
  return (
    <div>
      <GroupHeader label="Recent searches" />
      {recent.map((term) => (
        <button
          key={term}
          type="button"
          onClick={() => onPick(term)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm"
          style={{ color: "var(--kb-text-primary)" }}
        >
          <Search size={14} style={{ color: "var(--kb-text-secondary)" }} />
          {term}
        </button>
      ))}
    </div>
  );
}
