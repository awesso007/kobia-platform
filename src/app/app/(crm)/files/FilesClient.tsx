"use client";

/*
 * Document Library (Sprint 8). Folder tree on the left, file grid on the right.
 * Top bar: New Folder, Upload (multi), filters (mime / uploader / source),
 * search. Bulk select + bulk move/share/delete. Virtual folders Recent / Email
 * attachments / SMS attachments. Storage usage indicator. When S3 is not
 * configured a banner notes that LOCAL dev storage is in use.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRef, useState, useTransition } from "react";
import { FolderPlus, UploadCloud, Search } from "lucide-react";
import type { FileRow } from "@/lib/files/files";
import {
  listFiles,
  listFolders,
  createFolder,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile,
  createShareLink,
  type FolderRow,
  type FileFilter,
} from "../file-actions";
import { uploadFile } from "@/lib/files/upload-client";
import { FileCard, Lightbox, formatSize, isImage, type FileAction } from "@/components/crm/files/file-ui";

type View = "all" | "recent" | "email" | "sms";
type Pending = { id: string; name: string; fraction: number };

const VIRTUAL: { key: View; label: string }[] = [
  { key: "all", label: "All files" },
  { key: "recent", label: "Recent" },
  { key: "email", label: "Email attachments" },
  { key: "sms", label: "SMS attachments" },
];

export function FilesClient({
  initialFolders,
  initialFiles,
  uploaders,
  status,
}: {
  initialFolders: FolderRow[];
  initialFiles: FileRow[];
  uploaders: { clerkUserId: string; displayName: string }[];
  status: { s3Configured: boolean; totalBytes: number; fileCount: number };
}) {
  const [folders, setFolders] = useState<FolderRow[]>(initialFolders);
  const [files, setFiles] = useState<FileRow[]>(initialFiles);
  const [view, setView] = useState<View>("all");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [mimePrefix, setMimePrefix] = useState("");
  const [uploader, setUploader] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function currentFilter(over: Partial<FileFilter> = {}): FileFilter {
    return {
      view,
      folderId: view === "all" ? folderId : null,
      search: search.trim() || null,
      mimePrefix: mimePrefix || null,
      uploaderClerkUserId: uploader || null,
      ...over,
    };
  }

  async function refresh(filter?: FileFilter) {
    const data = await listFiles(filter ?? currentFilter());
    setFiles(data);
    setSelected(new Set());
  }

  function applyView(next: View) {
    setView(next);
    if (next !== "all") setFolderId(null);
    startTransition(async () => {
      await refresh({
        view: next,
        folderId: next === "all" ? folderId : null,
        search: search.trim() || null,
        mimePrefix: mimePrefix || null,
        uploaderClerkUserId: uploader || null,
      });
    });
  }

  function selectFolder(id: string | null) {
    setView("all");
    setFolderId(id);
    startTransition(async () => {
      await refresh({
        view: "all",
        folderId: id,
        search: search.trim() || null,
        mimePrefix: mimePrefix || null,
        uploaderClerkUserId: uploader || null,
      });
    });
  }

  async function handleFiles(list: FileList | File[]) {
    for (const file of Array.from(list)) {
      const tempId = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { id: tempId, name: file.name, fraction: 0 }]);
      const res = await uploadFile(
        file,
        { folderId: view === "all" ? folderId : null },
        (fraction) => setPending((p) => p.map((x) => (x.id === tempId ? { ...x, fraction } : x))),
      );
      setPending((p) => p.filter((x) => x.id !== tempId));
      if (res.ok) await refresh();
    }
  }

  async function newFolder() {
    const name = window.prompt("New folder name");
    if (!name || !name.trim()) return;
    const folder = await createFolder(name.trim(), null);
    setFolders((f) => [...f, folder].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function onAction(action: FileAction, file: FileRow) {
    if (action === "download") {
      const r = await getDownloadUrl(file.id, false);
      if (r.ok && r.url) window.open(r.url, "_blank");
    } else if (action === "rename") {
      const name = window.prompt("Rename file", file.name);
      if (name && name.trim()) { await renameFile(file.id, name.trim()); await refresh(); }
    } else if (action === "move") {
      const target = window.prompt(
        `Move to folder. Available:\n${folders.map((f) => f.name).join("\n") || "(none)"}\n\nType a folder name, or blank for root.`,
        "",
      );
      if (target !== null) {
        const folder = folders.find((f) => f.name.toLowerCase() === target.trim().toLowerCase());
        await moveFile(file.id, folder?.id ?? null);
        await refresh();
      }
    } else if (action === "share") {
      const r = await createShareLink({ fileId: file.id });
      if (r.ok && r.slug) {
        const url = `${window.location.origin}/share/${r.slug}?t=${tenantSlug()}`;
        window.prompt("Share link created. Copy it:", url);
      }
    } else if (action === "delete") {
      if (window.confirm(`Delete ${file.name}? This cannot be undone.`)) {
        await deleteFile(file.id);
        await refresh();
      }
    }
  }

  async function onOpen(file: FileRow) {
    const r = await getDownloadUrl(file.id, true);
    if (!r.ok || !r.url) return;
    if (isImage(file.mimeType)) setLightbox({ url: r.url, name: file.name });
    else window.open(r.url, "_blank");
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function bulk(action: "move" | "share" | "delete") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (action === "delete") {
      if (!window.confirm(`Delete ${ids.length} file(s)? This cannot be undone.`)) return;
      for (const id of ids) await deleteFile(id);
    } else if (action === "move") {
      const target = window.prompt(
        `Move ${ids.length} file(s) to folder. Available:\n${folders.map((f) => f.name).join("\n") || "(none)"}\n\nType a folder name, or blank for root.`,
        "",
      );
      if (target === null) return;
      const folder = folders.find((f) => f.name.toLowerCase() === target.trim().toLowerCase());
      for (const id of ids) await moveFile(id, folder?.id ?? null);
    } else if (action === "share") {
      for (const id of ids) await createShareLink({ fileId: id });
      window.alert(`Created ${ids.length} share link(s). Manage them in Settings > File shares.`);
    }
    await refresh();
  }

  return (
    <div className="kobia-crm flex h-full flex-col">
      {!status.s3Configured ? (
        <div
          className="px-5 py-2 text-sm"
          style={{ backgroundColor: "#fff8e1", color: "#8a6d00", borderBottom: "1px solid var(--kb-border)" }}
        >
          Using local file storage. Configure KOBIA_S3_* env vars for production-grade storage.
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Files</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={newFolder} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
            <FolderPlus size={15} /> New folder
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}>
            <UploadCloud size={15} /> Upload
          </button>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto p-3" style={{ borderRight: "1px solid var(--kb-border)" }}>
          {VIRTUAL.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => applyView(v.key)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm"
              style={{
                backgroundColor: view === v.key && folderId === null ? "var(--kb-surface-grey)" : "transparent",
                color: "var(--kb-text-primary)",
                borderRadius: "var(--kb-radius-sm)",
              }}
            >
              {v.label}
            </button>
          ))}
          <div className="mt-3 mb-1 px-2 text-[11px] font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>Folders</div>
          {folders.length === 0 ? (
            <p className="px-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>No folders</p>
          ) : (
            folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => selectFolder(f.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm"
                style={{
                  backgroundColor: view === "all" && folderId === f.id ? "var(--kb-surface-grey)" : "transparent",
                  color: "var(--kb-text-primary)",
                  borderRadius: "var(--kb-radius-sm)",
                }}
              >
                <span className="truncate">{f.name}</span>
                <span className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>{f.fileCount}</span>
              </button>
            ))
          )}

          <div className="mt-4 rounded p-2 text-[11px]" style={{ backgroundColor: "var(--kb-surface-grey)", color: "var(--kb-text-secondary)", borderRadius: "var(--kb-radius-sm)" }}>
            {status.fileCount} files - {formatSize(status.totalBytes)} used
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid var(--kb-border)" }}>
            <div className="flex items-center gap-1 rounded px-2" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
              <Search size={14} color="var(--kb-text-secondary)" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") refresh(); }}
                placeholder="Search files"
                className="py-1.5 text-sm outline-none"
                style={{ width: 160 }}
              />
            </div>
            <select value={mimePrefix} onChange={(e) => { setMimePrefix(e.target.value); }} className="rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
              <option value="">All types</option>
              <option value="image/">Images</option>
              <option value="application/pdf">PDF</option>
              <option value="video/">Video</option>
              <option value="audio/">Audio</option>
            </select>
            <select value={uploader} onChange={(e) => setUploader(e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>
              <option value="">All uploaders</option>
              {uploaders.map((u) => <option key={u.clerkUserId} value={u.clerkUserId}>{u.displayName}</option>)}
            </select>
            <button type="button" onClick={() => refresh()} className="rounded px-3 py-1.5 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)", color: "var(--kb-text-primary)" }}>Apply</button>

            {selected.size > 0 ? (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>{selected.size} selected</span>
                <button type="button" onClick={() => bulk("move")} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Move</button>
                <button type="button" onClick={() => bulk("share")} className="rounded px-2 py-1 text-sm" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Share</button>
                <button type="button" onClick={() => bulk("delete")} className="rounded px-2 py-1 text-sm" style={{ color: "#d9534f", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Delete</button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {pending.length ? (
              <ul className="mb-3 space-y-2">
                {pending.map((p) => (
                  <li key={p.id} className="rounded p-2" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
                    <div className="flex justify-between text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                      <span className="truncate">{p.name}</span><span>{Math.round(p.fraction * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded" style={{ backgroundColor: "var(--kb-surface-grey)" }}>
                      <div className="h-full" style={{ width: `${p.fraction * 100}%`, backgroundColor: "var(--kb-primary)" }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {files.length === 0 && pending.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No files here.</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                {files.map((f) => (
                  <FileCard
                    key={f.id}
                    file={f}
                    selected={selected.has(f.id)}
                    onSelect={(checked) => toggleSelect(f.id, checked)}
                    onOpen={onOpen}
                    onAction={onAction}
                    actions={["download", "rename", "move", "share", "delete"]}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {lightbox ? <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function tenantSlug(): string {
  if (typeof window === "undefined") return "acme";
  return new URLSearchParams(window.location.search).get("tenant") ?? "acme";
}
