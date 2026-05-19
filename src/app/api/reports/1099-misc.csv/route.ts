import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
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
  const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());

  if (!tenantSlug || !entityId) return new NextResponse("Missing params", { status: 400 });

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  const entity = await db.entity.findFirst({
    where: { id: entityId, tenantId: auth.tenant.id },
    select: { id: true, name: true },
  });
  if (!entity) return new NextResponse("Entity not found", { status: 404 });

  const rows = await get1099MiscRows({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
  });

  // Only export vendors with at least one reportable box.
  const reportable = rows.filter((r) => r.reportableBoxes.length > 0);

  const vendorWithDetail = await db.vendor.findMany({
    where: { id: { in: reportable.map((r) => r.vendorId) } },
    select: { id: true, remitToAddress: true },
  });
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
      "Content-Disposition": `attachment; filename="1099-MISC-${year}-${entity.name.replace(/[^a-z0-9]/gi, "_")}.csv"`,
    },
  });
}
