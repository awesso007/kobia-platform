/*
 * Client-side upload helper (Sprint 8). Runs the two-step upload flow used by
 * both the RecordPane Files tab and the Document Library:
 *   1. POST /api/files/upload-url -> create File (UPLOADING) + get an upload URL
 *      (presigned S3 PUT, or the LOCAL upload route).
 *   2. PUT the raw bytes to that URL (progress reported via XHR).
 *   3. POST /api/files/[id]/complete -> HEAD + mark READY + attach to a record.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */

export type UploadTarget = {
  entityType?: string;
  entityId?: string;
  folderId?: string | null;
};

export type UploadResult = { ok: boolean; fileId?: string; error?: string };

function putWithProgress(
  url: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.send(file);
  });
}

export async function uploadFile(
  file: File,
  target: UploadTarget = {},
  onProgress?: (fraction: number) => void,
): Promise<UploadResult> {
  const urlRes = await fetch("/api/files/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      entityType: target.entityType,
      entityId: target.entityId,
      folderId: target.folderId ?? null,
    }),
  });
  const prepared = (await urlRes.json()) as {
    ok: boolean;
    fileId?: string;
    uploadUrl?: string;
    error?: string;
  };
  if (!prepared.ok || !prepared.fileId || !prepared.uploadUrl) {
    return { ok: false, error: prepared.error ?? "Could not start upload." };
  }

  const putOk = await putWithProgress(prepared.uploadUrl, file, onProgress);
  if (!putOk) return { ok: false, error: "Upload failed." };

  const completeRes = await fetch(`/api/files/${prepared.fileId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: target.entityType,
      entityId: target.entityId,
    }),
  });
  const completed = (await completeRes.json()) as { ok: boolean; error?: string };
  if (!completed.ok) return { ok: false, error: completed.error ?? "Could not finalize upload." };

  return { ok: true, fileId: prepared.fileId };
}
