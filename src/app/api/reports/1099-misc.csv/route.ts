import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {auditedLegacyTaxExport,parseLegacyTaxYear} from "@/lib/accounting/legacy-tax-export";
import {
  get1099MiscRows,
  MISC_BOXES,
  MISC_BOX_LABELS,
} from "@/lib/accounting/tax-1099-misc";

function csvEscape(v: string | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function centsToDollars(c: bigint): string {
  const negative = c < 0n;
  const abs = negative ? -c : c;
  const whole = abs / 100n;
  const frac = abs % 100n;
  return `${negative ? "-" : ""}${whole.toString()}.${frac.toString().padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const entityId = url.searchParams.get("entityId");
  const year = parseLegacyTaxYear(url.searchParams.get("year"));
  if (!tenantSlug || !entityId || year === null)
    return new NextResponse("Invalid export parameters", { status: 400 });

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  let exportResult;
  try {
    exportResult = await auditedLegacyTaxExport(auth, entityId, "1099_MISC",
      async (tx, entity) => {
        const rows = await get1099MiscRows({
          tenantId: auth.tenant.id, entityId: entity.id, year, client: tx,
        });
        const reportable = rows.filter((r) => r.reportableBoxes.length > 0);
        const vendorWithDetail = await tx.vendor.findMany({
          where: {
            tenantId: auth.tenant.id, entityId: entity.id,
            id: { in: reportable.map((r) => r.vendorId) },
          },
          select: { id: true, remitToAddress: true },
        });
        return { reportable, vendorWithDetail };
      });
  } catch {
    return new NextResponse("Export unavailable", { status: 503 });
  }
  if (!exportResult) return new NextResponse("Forbidden", { status: 403 });
  const { entity, data: { reportable, vendorWithDetail } } = exportResult;
  const addrById = new Map(vendorWithDetail.map((v) => [v.id, v.remitToAddress ?? ""]));

  const header = [
    "Recipient Name",
    "Tax ID",
    "Address",
    "Email",
    ...MISC_BOXES.map((b) => `Box ${b} — ${MISC_BOX_LABELS[b]}`),
    "Unassigned",
    "Paid YTD",
    "Tax Year",
    "Payer Entity",
  ];

  const lines = [
    header.join(","),
    ...reportable.map((r) =>
      [
        csvEscape(r.vendorName),
        csvEscape(r.taxId ?? ""),
        csvEscape(addrById.get(r.vendorId) ?? ""),
        csvEscape(r.email ?? ""),
        ...MISC_BOXES.map((b) => centsToDollars(r.byBox[b] ?? 0n)),
        centsToDollars(r.unassigned),
        centsToDollars(r.paidYTD),
        String(year),
        csvEscape(entity.name),
      ].join(","),
    ),
  ];

  const csv = lines.join("\n") + "\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="1099-MISC-${year}-${entity.name.replace(/[^a-z0-9]/gi, "_")}.csv"`,
    },
  });
}
