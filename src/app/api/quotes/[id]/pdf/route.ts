/*
 * Quote PDF download (Sprint 10). REQUIRES permission (record:read) - this is
 * the internal/authenticated route used by the builder's PDF button, not the
 * public quote view. Renders the quote with @react-pdf/renderer and streams it
 * back inline as application/pdf.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { NextResponse, type NextRequest } from "next/server";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { requirePermission, PermissionError } from "@/lib/rbac/require-permission";
import { generateQuotePdfBuffer } from "@/app/app/(crm)/quotes/pdf";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requirePermission("record:read");
    const { buffer, fileName } = await generateQuotePdfBuffer(params.id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    if (err instanceof NoTenantError) return NextResponse.json({ ok: false, error: "No tenant." }, { status: 400 });
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
