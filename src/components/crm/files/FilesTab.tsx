"use client";

/*
 * RecordPane Files tab (Sprint 8). Full-pane drag-and-drop upload zone plus a
 * grid of files attached to the current record. Per-file upload progress bars,
 * a context menu (download / rename / move / share / detach / delete), an image
 * lightbox, and "open in new tab" for PDFs and documents.
 *
 * Files uploaded here are attached to the record (entityType/entityId) via the
 * complete step, so they appear both here and in the Document Library.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import type { RecordType } from "@/lib/crm/record";
import { ENTITY_TYPE_BY_RECORD } from "@/lib/crm/record";
import type { FileRow } from "@/lib/files/files";
import {
  listFilesForRecord,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile,
  detachFile,
  createShareLink,
  listFolders,
  type FolderRow,
} from "@/app/app/(crm)/file-actions";
import { uploadFile } from "@/lib/files/upload-client";
import { FileCard, Lightbox, isImage, type FileAction } from "./file-ui";

type Pending = { id: string; name: string; fraction: number };

export function FilesTab({ type, id }: { type: RecordType; id: string }) {
  const entityType = ENTITY_TYPE_BY_RECORD[type];
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listFilesForRecord(entityType, id)
      .then((data) => { if (active) setRows(data); })
      .finally(() => { if (active) setLoading(false); });
    listFolders().then((f) => { if (active) setFolders(f); }).catch(() => {});
    return () => { active = false; };
  }, [entityType, id]);

  async function refresh() {
    const data = await listFilesForRecord(entityType, id);
    setRows(data);
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      const tempId = `${file.name}-${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { id: tempId, name: file.name, fraction: 0 }]);
      const res = await uploadFile(
        file,
        { entityType, entityId: id },
        (fraction) => setPending((p) => p.map((x) => (x.id === tempId ? { ...x, fraction } : x))),
      );
      setPending((p) => p.filter((x) => x.id !== tempId));
      if (res.ok) await refresh();
    }
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
    } else if (action === "detach") {
      await detachFile({ fileId: file.id, entityType, entityId: id });
      await refresh();
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

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
      }}
    >
      {dragOver ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 grid place-items-center"
          style={{ backgroundColor: "rgba(29,119,189,0.08)", border: "2px dashed var(--kb-primary)" }}
        >
          <div className="flex flex-col items-center gap-2" style={{ color: "var(--kb-primary)" }}>
            <UploadCloud size={32} />
            <span className="text-sm font-medium">Drop files to upload</span>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        <span className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {rows.length} file{rows.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          <UploadCloud size={15} /> Upload
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {pending.length ? (
          <ul className="mb-3 space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="rounded p-2" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
                <div className="flex justify-between text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                  <span className="truncate">{p.name}</span>
                  <span>{Math.round(p.fraction * 100)}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded" style={{ backgroundColor: "var(--kb-surface-grey)" }}>
                  <div className="h-full" style={{ width: `${p.fraction * 100}%`, backgroundColor: "var(--kb-primary)" }} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {loading ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>Loading...</p>
        ) : rows.length === 0 && pending.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
            No files yet. Drag files here or use Upload.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {rows.map((f) => (
              <FileCard
                key={f.id}
                file={f}
                onOpen={onOpen}
                onAction={onAction}
                actions={["download", "rename", "move", "share", "detach", "delete"]}
              />
            ))}
          </div>
        )}
      </div>

      {lightbox ? <Lightbox url={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

/** Best-effort tenant slug from the ?tenant= query param (app shell sets it). */
function tenantSlug(): string {
  if (typeof window === "undefined") return "acme";
  return new URLSearchParams(window.location.search).get("tenant") ?? "acme";
}
