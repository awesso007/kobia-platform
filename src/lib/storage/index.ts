/*
 * Storage facade (Sprint 8). Chooses S3 when configured, otherwise LOCAL. The
 * rest of the app uses these provider-agnostic helpers and only branches on the
 * stored File.storageProvider when it must build a download URL.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import * as s3 from "./s3";
import * as local from "./local";

export { S3NotConfiguredError, S3_ENV_VARS } from "./s3";

export type StorageProvider = "S3" | "LOCAL";

export function activeProvider(): StorageProvider {
  return s3.isConfigured() ? "S3" : "LOCAL";
}

export function s3Configured(): boolean {
  return s3.isConfigured();
}

export type PreparedUpload = {
  provider: StorageProvider;
  storageKey: string;
  storageBucket: string | null;
  /* For S3: a presigned PUT URL. For LOCAL: the local-upload route path. */
  uploadUrl: string;
  /* HTTP method the client must use for uploadUrl. */
  uploadMethod: "PUT" | "POST";
};

export async function prepareUpload(input: {
  tenantSlug: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<PreparedUpload> {
  if (s3.isConfigured()) {
    const { uploadUrl, storageKey } = await s3.createPresignedUploadUrl(input);
    return {
      provider: "S3",
      storageKey,
      storageBucket: s3.bucketName(),
      uploadUrl,
      uploadMethod: "PUT",
    };
  }
  const storageKey = local.buildLocalStorageKey(input.tenantSlug, input.fileName);
  return {
    provider: "LOCAL",
    storageKey,
    storageBucket: null,
    uploadUrl: `/api/files/local-upload/${encodeURIComponent(storageKey)}`,
    uploadMethod: "PUT",
  };
}

export async function headStored(
  provider: StorageProvider,
  storageKey: string,
): Promise<{ size: number } | null> {
  if (provider === "S3") return s3.headObject(storageKey);
  return local.headLocalObject(storageKey);
}

export async function deleteStored(provider: StorageProvider, storageKey: string): Promise<void> {
  if (provider === "S3") return s3.deleteObject(storageKey);
  return local.deleteLocalObject(storageKey);
}

/**
 * Build a URL the browser (or Twilio) can fetch to download the object. For S3
 * this is a presigned GET; for LOCAL it is the local-serve route.
 */
export async function downloadUrl(
  provider: StorageProvider,
  storageKey: string,
  opts?: { contentDisposition?: string; expiresIn?: number },
): Promise<string> {
  if (provider === "S3") return s3.createPresignedDownloadUrl(storageKey, opts);
  return `/api/files/local/${encodeURIComponent(storageKey)}`;
}
