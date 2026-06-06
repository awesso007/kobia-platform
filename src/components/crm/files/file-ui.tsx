"use client";

/*
 * Shared file UI primitives (Sprint 8) used by the RecordPane Files tab and the
 * Document Library: size formatting, a mime icon, a file card with a context
 * menu, and an image lightbox. Kept presentational - the parent supplies the
 * row data and the action callbacks.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useEffect, useRef, useState } from "react";
import {
  File as FileIcon,
  FileText,
  FileImage,
  FileSpreadsheet,
  FileArchive,
  Film,
  Music,
  MoreVertical,
  X,
} from "lucide-react";
import type { FileRow } from "@/lib/files/files";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

function MimeIcon({ mime, size = 28 }: { mime: string; size?: number }) {
  const color = "var(--kb-text-secondary)";
  if (mime.startsWith("image/")) return <FileImage size={size} color={color} />;
  if (mime.startsWith("video/")) return <Film size={size} color={color} />;
  if (mime.startsWith("audio/")) return <Music size={size} color={color} />;
  if (mime === "application/pdf") return <FileText size={size} color={color} />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv")
    return <FileSpreadsheet size={size} color={color} />;
  if (mime.includes("zip") || mime.includes("compressed")) return <FileArchive size={size} color={color} />;
  if (mime.startsWith("text/") || mime.includes("word") || mime.includes("document"))
    return <FileText size={size} color={color} />;
  return <FileIcon size={size} color={color} />;
}

export type FileAction =
  | "download"
  | "rename"
  | "move"
  | "share"
  | "detach"
  | "delete";

export function FileCard({
  file,
  selected,
  onSelect,
  onOpen,
  onAction,
  actions,
}: {
  file: FileRow;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  onOpen?: (file: FileRow) => void;
  onAction: (action: FileAction, file: FileRow) => void;
  actions: FileAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div
      className="relative flex flex-col rounded p-3"
      style={{
        border: selected ? "1px solid var(--kb-primary)" : "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius-sm)",
        backgroundColor: "var(--kb-surface)",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        {onSelect ? (
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select ${file.name}`}
          />
        ) : (
          <span />
        )}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="File actions"
            className="grid h-6 w-6 place-items-center rounded"
            style={{ color: "var(--kb-text-secondary)" }}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen ? (
            <div
              className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded py-1"
              style={{
                backgroundColor: "var(--kb-surface)",
                border: "1px solid var(--kb-border)",
                borderRadius: "var(--kb-radius-sm)",
                boxShadow: "var(--kb-shadow-modal)",
              }}
            >
              {actions.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onAction(a, file);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm capitalize"
                  style={{ color: a === "delete" ? "#d9534f" : "var(--kb-text-primary)" }}
                >
                  {a}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onOpen?.(file)}
        className="mt-1 grid h-16 w-full place-items-center rounded"
        style={{ backgroundColor: "var(--kb-surface-grey)", borderRadius: "var(--kb-radius-sm)" }}
      >
        <MimeIcon mime={file.mimeType} />
      </button>

      <p
        className="mt-2 truncate text-sm"
        title={file.name}
        style={{ fontWeight: 500, color: "var(--kb-text-primary)" }}
      >
        {file.name}
      </p>
      <p className="text-[11px]" style={{ color: "var(--kb-text-secondary)" }}>
        {formatSize(file.size)} - {new Date(file.createdAt).toLocaleDateString()}
      </p>
    </div>
  );
}

export function Lightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-6"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded"
        style={{ backgroundColor: "var(--kb-surface)", color: "var(--kb-text-primary)" }}
      >
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "var(--kb-radius-sm)" }}
      />
    </div>
  );
}
