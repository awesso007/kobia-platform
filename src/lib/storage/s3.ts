/*
 * Storage module (Sprint 8). Direct-to-S3 uploads via presigned PUT URLs, with a
 * LOCAL filesystem fallback for dev when no S3 credentials are configured.
 *
 * S3 mode is active when KOBIA_S3_BUCKET + KOBIA_S3_REGION +
 * KOBIA_S3_ACCESS_KEY_ID + KOBIA_S3_SECRET_ACCESS_KEY are all set. An optional
 * KOBIA_S3_ENDPOINT targets S3-compatible stores (Cloudflare R2, MinIO).
 *
 * When S3 is not configured, callers should fall back to LOCAL mode (files under
 * /tmp/kobia-files/<tenantSlug>/...) served through /api/files/local routes. The
 * S3 helpers here throw S3NotConfiguredError so the caller can branch.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export class S3NotConfiguredError extends Error {
  constructor() {
    super("S3 storage is not configured. Set KOBIA_S3_* env vars.");
    this.name = "S3NotConfiguredError";
  }
}

export const S3_ENV_VARS = [
  "KOBIA_S3_BUCKET",
  "KOBIA_S3_REGION",
  "KOBIA_S3_ACCESS_KEY_ID",
  "KOBIA_S3_SECRET_ACCESS_KEY",
] as const;

export function isConfigured(): boolean {
  return S3_ENV_VARS.every((name) => Boolean(process.env[name]));
}

export function bucketName(): string | null {
  return process.env.KOBIA_S3_BUCKET ?? null;
}

let cachedClient: S3Client | null = null;

function client(): S3Client {
  if (!isConfigured()) throw new S3NotConfiguredError();
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: process.env.KOBIA_S3_REGION!,
    endpoint: process.env.KOBIA_S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.KOBIA_S3_ENDPOINT),
    credentials: {
      accessKeyId: process.env.KOBIA_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.KOBIA_S3_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

/** Slugify a filename for use inside a storage key (keep the extension). */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "file";
}

/** tenants/<slug>/<yyyy>/<mm>/<uuid>__<safe-filename> */
export function buildStorageKey(tenantSlug: string, fileName: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const uuid = randomUUID();
  return `tenants/${tenantSlug}/${yyyy}/${mm}/${uuid}__${safeFileName(fileName)}`;
}

export type PresignedUpload = { uploadUrl: string; storageKey: string };

export async function createPresignedUploadUrl(input: {
  tenantSlug: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<PresignedUpload> {
  const storageKey = buildStorageKey(input.tenantSlug, input.fileName);
  const cmd = new PutObjectCommand({
    Bucket: bucketName()!,
    Key: storageKey,
    ContentType: input.mimeType,
  });
  const uploadUrl = await getSignedUrl(client(), cmd, { expiresIn: 60 * 15 });
  return { uploadUrl, storageKey };
}

/** Server-side write of raw bytes to a known key (inbound email ingest). */
export async function putObject(storageKey: string, data: Buffer, mimeType?: string): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: bucketName()!,
      Key: storageKey,
      Body: data,
      ContentType: mimeType,
    }),
  );
}

export type HeadResult = { size: number; mimeType: string | null };

export async function headObject(storageKey: string): Promise<HeadResult | null> {
  try {
    const res = await client().send(
      new HeadObjectCommand({ Bucket: bucketName()!, Key: storageKey }),
    );
    return { size: Number(res.ContentLength ?? 0), mimeType: res.ContentType ?? null };
  } catch {
    return null;
  }
}

/**
 * Presigned GET URL. contentDisposition controls inline vs attachment, and is
 * also used by SMS sends (Twilio needs a > 1h lifetime to fetch media).
 */
export async function createPresignedDownloadUrl(
  storageKey: string,
  opts?: { contentDisposition?: string; expiresIn?: number },
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucketName()!,
    Key: storageKey,
    ResponseContentDisposition: opts?.contentDisposition,
  });
  return getSignedUrl(client(), cmd, { expiresIn: opts?.expiresIn ?? 60 * 15 });
}

export async function deleteObject(storageKey: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucketName()!, Key: storageKey }));
}
