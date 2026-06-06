"use client";

/*
 * Client UI for a public share link (Sprint 8). Shows the file name + size and
 * a Download button. When the link is password protected it reveals an input;
 * the actual validation + byte serving happens server-side in /api/share/[slug]
 * (this just builds the URL and navigates to it).
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState } from "react";
import { KbButton } from "@/components/crm/ui";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ShareClient({
  tenantSlug,
  shareSlug,
  fileName,
  size,
  hasPassword,
}: {
  tenantSlug: string;
  shareSlug: string;
  fileName: string;
  size: number;
  hasPassword: boolean;
}) {
  const [password, setPassword] = useState("");

  function download() {
    const qs = new URLSearchParams({ t: tenantSlug });
    if (hasPassword) qs.set("password", password);
    window.location.href = `/api/share/${encodeURIComponent(shareSlug)}?${qs.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
          {fileName}
        </h1>
        <p className="mt-1" style={{ fontSize: 13, color: "var(--kb-text-secondary)" }}>
          {formatSize(size)}
        </p>
      </div>

      {hasPassword && (
        <label className="flex flex-col gap-1" style={{ fontSize: 13, color: "var(--kb-text-secondary)" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded px-2 py-1.5"
            style={{
              border: "1px solid var(--kb-border)",
              borderRadius: "var(--kb-radius-sm)",
              color: "var(--kb-text-primary)",
            }}
          />
        </label>
      )}

      <KbButton onClick={download} disabled={hasPassword && !password}>
        Download
      </KbButton>
    </div>
  );
}
