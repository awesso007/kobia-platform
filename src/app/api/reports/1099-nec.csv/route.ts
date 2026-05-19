import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

const THRESHOLD_CENTS = 60000n; // $600

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
  return `${negative ? "-" : ""}${whole.toString()}.${frac
    .toString()
    .padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tenantSlug = url.searchParams.get("tenant");
  const entityId = url.searchParams.get("entityId");
  const year = Number(url.searchParams.get("year") ?? new Date().getUTCFullYear());

  if (!tenantSlug || !entityId)
    return new NextResponse("Missing params", { status: 400 });

  const auth = await getAuthContext(tenantSlug);
  if (!auth) return new NextResponse("Unauthorized", { status: 401 });

  // Confirm entity belongs to tenant
  const entity = await db.entity.findFirst({
    where: { id: entityId, tenantId: auth.tenant.id },
    select: { id: true, name: true },
  });
  if (!entity) return new NextResponse("Entity not found", { status: 404 });

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const vendors = await db.vendor.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      is1099Vendor: true,
    },
    include: {
      bills: {
        select: {
          payments: {
            where: { paymentDate: { gte: yearStart, lt: yearEnd } },
            select: { amountCents: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = vendors
    .map((v) => {
      const paid = v.bills.reduce(
        (s, b) => s + b.payments.reduce((s2, p) => s2 + p.amountCents, 0n),
        0n
      );
      return { vendor: v, paid };
    })
    .filter((r) => r.paid >= THRESHOLD_CENTS);

  const header = [
    "Recipient Name",
    "Tax ID",
    "Address",
    "Email",
    "Box 1 — Nonemployee Compensation",
    "Tax Year",
    "Payer Entity",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        csvEscape(r.vendor.name),
        csvEscape(r.vendor.taxId ?? ""),
        csvEscape(r.vendor.remitToAddress ?? ""),
        csvEscape(r.vendor.email ?? ""),
        centsToDollars(r.paid),
        String(year),
        csvEscape(entity.name),
      ].join(",")
    ),
  ];

  const csv = lines.join("\n") + "\n";
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="1099-NEC-${year}-${entity.name.replace(/[^a-z0-9]/gi, "_")}.csv"`,
    },
  });
}
