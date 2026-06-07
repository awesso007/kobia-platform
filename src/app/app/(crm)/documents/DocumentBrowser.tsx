"use client";

/*
 * Folder/file browser (Sprint 14). Renders subfolders + documents for the
 * current folder, a breadcrumb, and the New folder / New doc / Upload actions.
 * Selecting a row shows a small detail pane with Rename / Move / Delete and a
 * link into the full document detail page.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Card, EmptyState, PrimaryButton, GhostButton, DocBadge } from "./DocumentsUI";
import { fmtDate, formatBytes, pathCrumbs } from "./documents-utils";
import type { FolderRow, DocRow } from "./queries";
import {
  createFolder,
  createDocument,
  renameFolder,
  renameDocument,
  moveFolder,
  moveDocument,
  deleteFolder,
  deleteDocument,
} from "./actions";

type AllFolder = { id: string; name: string; path: string };

export function DocumentBrowser({
  folder,
  folders,
  documents,
  allFolders,
}: {
  folder: { id: string; name: string; path: string; parentId: string | null } | null;
  folders: FolderRow[];
  documents: DocRow[];
  allFolders: AllFolder[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<{ type: "folder" | "doc"; id: string; name: string } | null>(null);

  const crumbs = pathCrumbs(folder?.path);
  const currentId = folder?.id ?? null;

  function go(folderId: string | null) {
    setSel(null);
    router.push(folderId ? `/app/documents?folder=${folderId}` : "/app/documents");
  }

  function onNewFolder() {
    const name = window.prompt("New folder name");
    if (!name) return;
    start(async () => {
      await createFolder({ name, parentId: currentId });
      router.refresh();
    });
  }

  function onNewDoc() {
    const name = window.prompt("New document name");
    if (!name) return;
    start(async () => {
      const id = await createDocument({ name, folderId: currentId, kind: "DOC", bodyHtml: "<p></p>", mimeType: "text/html" });
      router.push(`/app/documents/doc/${id}/edit`);
    });
  }

  function onUpload() {
    const name = window.prompt("File name (placeholder upload)");
    if (!name) return;
    start(async () => {
      await createDocument({ name, folderId: currentId, kind: "FILE", mimeType: "application/octet-stream" });
      router.refresh();
    });
  }

  function onRename() {
    if (!sel) return;
    const name = window.prompt("Rename to", sel.name);
    if (!name) return;
    start(async () => {
      if (sel.type === "folder") await renameFolder(sel.id, name);
      else await renameDocument(sel.id, name);
      setSel(null);
      router.refresh();
    });
  }

  function onMove() {
    if (!sel) return;
    const options = allFolders.filter((f) => f.id !== sel.id);
    const choice = window.prompt(
      `Move to folder id (blank = root):\n${options.map((f) => `${f.path} = ${f.id}`).join("\n")}`,
      "",
    );
    if (choice === null) return;
    const target = choice.trim() || null;
    start(async () => {
      if (sel.type === "folder") await moveFolder(sel.id, target);
      else await moveDocument(sel.id, target);
      setSel(null);
      router.refresh();
    });
  }

  function onDelete() {
    if (!sel) return;
    if (!window.confirm(`Delete ${sel.name}? This cannot be undone.`)) return;
    start(async () => {
      if (sel.type === "folder") await deleteFolder(sel.id);
      else await deleteDocument(sel.id);
      setSel(null);
      router.refresh();
    });
  }

  const empty = folders.length === 0 && documents.length === 0;

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-1 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          <button onClick={() => go(null)} className="hover:underline" style={{ color: "var(--kb-primary)" }}>
            Documents
          </button>
          {crumbs.map((c, i) => {
            const fId = allFolders.find((f) => f.path === c.path)?.id ?? null;
            const isLast = i === crumbs.length - 1;
            return (
              <span key={c.path} className="flex items-center gap-1">
                <span>/</span>
                {isLast ? (
                  <span style={{ color: "var(--kb-text-primary)" }}>{c.name}</span>
                ) : (
                  <button onClick={() => go(fId)} className="hover:underline" style={{ color: "var(--kb-primary)" }}>
                    {c.name}
                  </button>
                )}
              </span>
            );
          })}
        </div>

        <div className="mb-4 flex gap-2">
          <PrimaryButton onClick={onNewFolder} disabled={pending}>
            New folder
          </PrimaryButton>
          <GhostButton onClick={onNewDoc} disabled={pending}>
            New doc
          </GhostButton>
          <GhostButton onClick={onUpload} disabled={pending}>
            Upload file
          </GhostButton>
        </div>

        <Card>
          {empty ? (
            <EmptyState message="This folder is empty." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Size</Th>
                  <Th>Updated</Th>
                </tr>
              </thead>
              <tbody>
                {folders.map((f) => (
                  <tr
                    key={f.id}
                    className="cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--kb-border)",
                      backgroundColor: sel?.id === f.id ? "var(--kb-hover, #f5f5f5)" : undefined,
                    }}
                    onClick={() => setSel({ type: "folder", id: f.id, name: f.name })}
                  >
                    <Td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          go(f.id);
                        }}
                        className="font-medium hover:underline"
                        style={{ color: "var(--kb-primary)" }}
                      >
                        {f.name}/
                      </button>
                    </Td>
                    <Td>Folder</Td>
                    <Td>{f.childCount + f.docCount} items</Td>
                    <Td>-</Td>
                  </tr>
                ))}
                {documents.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer"
                    style={{
                      borderBottom: "1px solid var(--kb-border)",
                      backgroundColor: sel?.id === d.id ? "var(--kb-hover, #f5f5f5)" : undefined,
                    }}
                    onClick={() => setSel({ type: "doc", id: d.id, name: d.name })}
                  >
                    <Td>
                      <Link
                        href={`/app/documents/${d.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium hover:underline"
                        style={{ color: "var(--kb-primary)" }}
                      >
                        {d.name}
                      </Link>
                    </Td>
                    <Td>
                      <DocBadge value={d.kind} />
                    </Td>
                    <Td>{d.kind === "FILE" ? formatBytes(d.sizeBytes) : `v${d.version}`}</Td>
                    <Td>{fmtDate(d.updatedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {sel ? (
        <div className="w-64 shrink-0">
          <Card className="p-4">
            <div className="mb-1 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
              {sel.type === "folder" ? "Folder" : "Document"}
            </div>
            <div className="mb-4 font-medium" style={{ color: "var(--kb-text-primary)" }}>
              {sel.name}
            </div>
            <div className="flex flex-col gap-2">
              {sel.type === "doc" ? (
                <Link
                  href={`/app/documents/${sel.id}`}
                  className="text-sm hover:underline"
                  style={{ color: "var(--kb-primary)" }}
                >
                  Open details
                </Link>
              ) : null}
              <GhostButton onClick={onRename} disabled={pending}>
                Rename
              </GhostButton>
              <GhostButton onClick={onMove} disabled={pending}>
                Move
              </GhostButton>
              <GhostButton onClick={onDelete} disabled={pending}>
                Delete
              </GhostButton>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ color: "var(--kb-text-primary)" }}>
      {children}
    </td>
  );
}
