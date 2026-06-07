"use client";

/*
 * Lightweight rich-text editor (Sprint 14) for DOC documents. Uses a
 * contentEditable surface with a small formatting toolbar (document.execCommand,
 * sufficient for the in-app editor) and saves through saveDocumentBody, which
 * snapshots the prior revision and increments the version.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PrimaryButton, GhostButton } from "../../../DocumentsUI";
import { saveDocumentBody } from "../../../actions";

const TOOLS: Array<{ cmd: string; label: string; arg?: string }> = [
  { cmd: "bold", label: "B" },
  { cmd: "italic", label: "I" },
  { cmd: "underline", label: "U" },
  { cmd: "insertUnorderedList", label: "List" },
  { cmd: "formatBlock", label: "H2", arg: "h2" },
  { cmd: "formatBlock", label: "P", arg: "p" },
];

export function DocEditor({ id, name, version, initialHtml }: { id: string; name: string; version: number; initialHtml: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [savedVersion, setSavedVersion] = useState(version);
  const [status, setStatus] = useState<string>("");

  function exec(cmd: string, arg?: string) {
    document.execCommand(cmd, false, arg);
    ref.current?.focus();
  }

  function onSave() {
    const html = ref.current?.innerHTML ?? "";
    start(async () => {
      const next = await saveDocumentBody(id, html);
      setSavedVersion(next);
      setStatus(`Saved as v${next}`);
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link href={`/app/documents/${id}`} className="text-sm hover:underline" style={{ color: "var(--kb-primary)" }}>
            Back to document
          </Link>
          <h1 className="text-xl font-semibold" style={{ color: "var(--kb-text-primary)" }}>
            {name}
          </h1>
          <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
            Current version v{savedVersion}
            {status ? ` - ${status}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/app/documents/${id}`}>
            <GhostButton>Done</GhostButton>
          </Link>
          <PrimaryButton onClick={onSave} disabled={pending}>
            {pending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </div>

      <div
        className="mb-2 flex flex-wrap gap-1 rounded p-2"
        style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
      >
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => exec(t.cmd, t.arg)}
            className="rounded px-2 py-1 text-sm"
            style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        className="prose min-h-[400px] max-w-none rounded p-4 text-sm focus:outline-none"
        style={{
          backgroundColor: "var(--kb-surface)",
          border: "1px solid var(--kb-border)",
          borderRadius: "var(--kb-radius)",
          color: "var(--kb-text-primary)",
        }}
        dangerouslySetInnerHTML={{ __html: initialHtml || "<p></p>" }}
      />
    </div>
  );
}
