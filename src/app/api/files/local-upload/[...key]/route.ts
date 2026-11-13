/**
 * LOCAL development-only upload sink. Unlike S3, a storage key by itself is
 * NOT a write capability: require same-origin, live Clerk permission, uploaded
 * file ownership, tenant prefix, UPLOADING state and exact declared size.
 * Never enable this ephemeral /tmp fallback in production.
 */
import { NextResponse, type NextRequest } from "next/server";
import { writeLocalObject } from "@/lib/storage/local";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission, getCurrentMembership } from "@/lib/rbac/require-permission";
import { binaryMutationSameOrigin, localUploadIsAuthorized, MAX_LOCAL_UPLOAD_BYTES } from "@/lib/security/historical-mutation-boundaries";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: { key: string[] } }) {
  if (process.env.NODE_ENV === "production")
    return NextResponse.json({ ok: false, error: "Local storage unavailable." }, { status: 503 });
  if (!binaryMutationSameOrigin(req, process.env.CHESS_PUBLIC_ORIGIN, false))
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_LOCAL_UPLOAD_BYTES)
    return NextResponse.json({ ok: false, error: "Upload too large." }, { status: 413 });
  try {
    await requirePermission("record:create");
    const member = await getCurrentMembership();
    const { db, tenantId } = getTenantDb();
    const storageKey = decodeURIComponent(params.key.join("/"));
    if (!storageKey.startsWith(`tenants/${tenantId}/`))
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    const file = await db.file.findUnique({
      where: { storageKey },
      select: { storageKey: true, storageProvider: true, status: true, size: true, uploadedByClerkUserId: true },
    });
    if (!file || !member || member.status !== "ACTIVE")
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (file.storageProvider !== "LOCAL" || file.status !== "UPLOADING" ||
        file.uploadedByClerkUserId !== member.clerkUserId)
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    if (file.size <= 0n || file.size > BigInt(MAX_LOCAL_UPLOAD_BYTES))
      return NextResponse.json({ ok: false, error: "Invalid declared file size." }, { status: 413 });
    // Streaming bound: reject on the first oversized chunk, not after an
    // unbounded arrayBuffer allocation.
    if (!req.body) return NextResponse.json({ ok: false, error: "Missing bytes." }, { status: 400 });
    const chunks: Buffer[] = [];
    const reader = req.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_LOCAL_UPLOAD_BYTES || BigInt(total) > file.size) {
          await reader.cancel();
          return NextResponse.json({ ok: false, error: "Upload too large." }, { status: 413 });
        }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
    if (!localUploadIsAuthorized({
      actorUserId: member.clerkUserId, tenantSlug: tenantId,
      storageKey, provider: file.storageProvider, status: file.status,
      uploadedByClerkUserId: file.uploadedByClerkUserId,
      declaredSize: file.size, actualSize: total,
    })) return NextResponse.json({ ok: false, error: "Invalid upload." }, { status: 409 });
    await writeLocalObject(storageKey, Buffer.concat(chunks));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Upload unavailable." }, { status: 403 });
  }
}
