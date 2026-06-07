"use client";

/*
 * Document detail client surface (Sprint 14). Renders metadata, version history,
 * share links (create/delete), permissions, and primary actions (open editor for
 * DOC, download for FILE, send for signature). Share-link creation calls the
 * server action and surfaces the public /d/<token> URL.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card, DocBadge, PrimaryButton, GhostButton } from "../DocumentsUI";
import { fmtDateTime, formatBytes } from "../documents-utils";
import { createShareLink, deleteShareLink } from "../actions";

type ShareLink = {
  id: string;
  token: string;
  password: string | null;
  expiresAt: Date | null;
  allowDownload: boolean;
  createdAt: Date;
};
type Version = { id: string; version: number; name: string; sizeBytes: number; createdAt: Date };
type EnvelopeLite = { id: string; name: string; status: string; createdAt: Date };

export function DocumentDetail({
  doc,
  appUrl,
}: {
  doc: {
    id: string;
    name: string;
    kind: string;
    mimeType: string | null;
    sizeBytes: number;
    version: number;
    bodyHtml: string | null;
    folder: { id: string; name: string; path: string } | null;
    versions: Version[];
    shareLinks: ShareLink[];
    envelopes: EnvelopeLite[];
    updatedAt: Date;
  };
  appUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [newToken, setNewToken] = useState<string | null>(null);

  function onCreateShare() {
    const password = window.prompt("Optional password (blank for none)", "") || null;
    start(async () => {
      const { token } = await createShareLink({ documentId: doc.id, password, allowDownload: true });
      setNewToken(token);
      router.refresh();
    });
  }

  function onDeleteShare(id: string) {
    start(async () => {
      await deleteShareLink(id, doc.id);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-semibold" style={{ color: "var(--kb-text-primary)" }}>
              {doc.name}
            </h2>
            <DocBadge value={doc.kind} />
          </div>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Dt>Folder</Dt>
            <Dd>
              {doc.folder ? (
                <Link href={`/app/documents?folder=${doc.folder.id}`} style={{ color: "var(--kb-primary)" }} className="hover:underline">
                  {doc.folder.path}
                </Link>
              ) : (
                "/ (root)"
              )}
            </Dd>
            <Dt>Type</Dt>
            <Dd>{doc.mimeType ?? doc.kind}</Dd>
            {doc.kind === "FILE" ? (
              <>
                <Dt>Size</Dt>
                <Dd>{formatBytes(doc.sizeBytes)}</Dd>
              </>
            ) : null}
            <Dt>Version</Dt>
            <Dd>v{doc.version}</Dd>
            <Dt>Updated</Dt>
            <Dd>{fmtDateTime(doc.updatedAt)}</Dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {doc.kind === "DOC" ? (
              <Link href={`/app/documents/doc/${doc.id}/edit`}>
                <PrimaryButton>Open editor</PrimaryButton>
              </Link>
            ) : (
              <a href={`/api/documents/${doc.id}/download`}>
                <PrimaryButton>Download</PrimaryButton>
              </a>
            )}
            <Link href={`/app/documents/envelopes/new?documentId=${doc.id}`}>
              <GhostButton>Send for signature</GhostButton>
            </Link>
          </div>
        </Card>

        {doc.kind === "DOC" && doc.bodyHtml ? (
          <Card className="p-4">
            <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
              Preview
            </div>
            <div
              className="prose max-w-none text-sm"
              style={{ color: "var(--kb-text-primary)" }}
              dangerouslySetInnerHTML={{ __html: doc.bodyHtml }}
            />
          </Card>
        ) : null}

        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
            Version history
          </div>
          {doc.versions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              No prior versions.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {doc.versions.map((v) => (
                <li key={v.id} className="flex justify-between" style={{ color: "var(--kb-text-primary)" }}>
                  <span>v{v.version} - {v.name}</span>
                  <span style={{ color: "var(--kb-text-secondary)" }}>{fmtDateTime(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
              Share links
            </div>
            <GhostButton onClick={onCreateShare} disabled={pending}>
              New link
            </GhostButton>
          </div>
          {newToken ? (
            <div className="mb-2 break-all rounded p-2 text-xs" style={{ backgroundColor: "var(--kb-hover, #f5f5f5)" }}>
              {appUrl}/d/{newToken}
            </div>
          ) : null}
          {doc.shareLinks.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              No share links.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {doc.shareLinks.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="break-all" style={{ color: "var(--kb-text-primary)" }}>
                    /d/{s.token}
                    {s.password ? " (password)" : ""}
                  </span>
                  <button
                    onClick={() => onDeleteShare(s.id)}
                    disabled={pending}
                    className="text-xs hover:underline"
                    style={{ color: "#d9534f" }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
            Envelopes
          </div>
          {doc.envelopes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              No signature requests.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {doc.envelopes.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/documents/envelopes/${e.id}`} className="hover:underline" style={{ color: "var(--kb-primary)" }}>
                    {e.name}
                  </Link>
                  <DocBadge value={e.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Dt({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase" style={{ color: "var(--kb-text-secondary)" }}>
      {children}
    </dt>
  );
}
function Dd({ children }: { children: React.ReactNode }) {
  return <dd style={{ color: "var(--kb-text-primary)" }}>{children}</dd>;
}
