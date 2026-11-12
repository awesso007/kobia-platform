import { NextResponse } from "next/server";
import { z } from "zod";
import {
  safeChessAttachmentDisposition,
  streamChessDocumentDownload,
} from "@/lib/chess/documents";
import { PermissionError } from "@/lib/rbac/require-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  businessId: z.string().min(1).max(128),
  clientProfileId: z.string().min(1).max(128),
  service: z.enum([
    "ACCOUNTING",
    "BOOKKEEPING",
    "PAYROLL",
    "TAX",
    "MORTGAGE",
    "INSURANCE",
    "REAL_ESTATE",
    "INVESTMENTS",
  ]),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      businessId: url.searchParams.get("businessId"),
      clientProfileId: url.searchParams.get("clientProfileId"),
      service: url.searchParams.get("service"),
    });
    if (!parsed.success || !params.id) {
      return NextResponse.json({ error: "invalid_request" }, {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      });
    }

    // This route repeats current membership, service grant, consent, retention,
    // suppression and pinned-object checks for every byte request. No S3 URL
    // or bearer download token is issued to the browser.
    const file = await streamChessDocumentDownload(
      params.id,
      parsed.data.businessId,
      parsed.data.clientProfileId,
      parsed.data.service,
    );
    const headers = new Headers({
      "Content-Type": file.mimeType,
      "Content-Disposition": safeChessAttachmentDisposition(file.fileName),
      "Cache-Control": "private, no-store, no-cache, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    if (file.actualBytes !== null && Number.isSafeInteger(file.actualBytes) && file.actualBytes > 0) {
      headers.set("Content-Length", String(file.actualBytes));
    }
    return new NextResponse(file.stream, { status: 200, headers });
  } catch (error) {
    if (error instanceof PermissionError) {
      // Do not disclose whether a document, client or service exists.
      return NextResponse.json({ error: "document_unavailable" }, {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ error: "document_unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
