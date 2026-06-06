"use client";

/*
 * File shares list + revoke (Sprint 8).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { revokeShareLink, type ShareLinkRow } from "../../../file-actions";

export function SharesClient({ links, tenantSlug }: { links: ShareLinkRow[]; tenantSlug: string }) {
  const [rows, setRows] = useState<ShareLinkRow[]>(links);

  async function revoke(id: string) {
    if (!window.confirm("Revoke this share link? Anyone holding it will lose access.")) return;
    await revokeShareLink(id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  function copy(slug: string) {
    const url = `${window.location.origin}/share/${slug}?t=${tenantSlug}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    window.prompt("Share link:", url);
  }

  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No active share links.</p>;
  }

  return (
    <table className="w-full text-sm" style={{ color: "var(--kb-text-primary)" }}>
      <thead>
        <tr style={{ color: "var(--kb-text-secondary)", borderBottom: "1px solid var(--kb-border)" }}>
          <th className="py-2 text-left font-medium">File</th>
          <th className="py-2 text-left font-medium">Password</th>
          <th className="py-2 text-left font-medium">Expires</th>
          <th className="py-2 text-left font-medium">Downloads</th>
          <th className="py-2 text-left font-medium">Created</th>
          <th className="py-2" />
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
            <td className="py-2">{l.fileName}</td>
            <td className="py-2">{l.hasPassword ? "Yes" : "No"}</td>
            <td className="py-2">{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : "Never"}</td>
            <td className="py-2">{l.downloadCount}{l.maxDownloads !== null ? ` / ${l.maxDownloads}` : ""}</td>
            <td className="py-2">{new Date(l.createdAt).toLocaleDateString()}</td>
            <td className="py-2 text-right">
              <button type="button" onClick={() => copy(l.slug)} className="mr-2 rounded px-2 py-1" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Copy</button>
              <button type="button" onClick={() => revoke(l.id)} className="rounded px-2 py-1" style={{ color: "#d9534f", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>Revoke</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
