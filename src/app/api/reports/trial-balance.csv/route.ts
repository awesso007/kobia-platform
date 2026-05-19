/**
 * Trial Balance CSV export.
 *
 * Query params:
 *   entity   — required, entity id
 *   asOf     — optional ISO date (YYYY-MM-DD), defaults to today
 *   gross    — if "1", export gross debits + credits; otherwise balance style
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import {
  buildTrialBalance,
  toBalanceStyleRows,
} from "@/lib/accounting/trial-balance";

export const dynamic = "force-dynamic";

function csvEscape(v: string): string {
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entityId = url.searchParams.get("entity");
  const asOfStr = url.searchParams.get("asOf");
  const gross = url.searchParams.get("gross") === "1";

  if (!entityId) {
    return new NextResponse("Missing entity", { status: 400 });
  }

  // Look up entity → tenant for auth
  const entity = await db.entity.findUnique({
    where: { id: entityId },
    include: { tenant: true },
  });
  if (!entity) return new NextResponse("Entity not found", { status: 404 });

  const auth = await getAuthContext(entity.tenant.slug);
  if (!auth || auth.tenant.id !== entity.tenantId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const asOfDate = asOfStr
    ? new Date(asOfStr + "T23:59:59")
    : new Date();
  const asOfDateStr = asOfDate.toISOString().slice(0, 10);

  const tb = await buildTrialBalance({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    asOfDate,
  });

  const lines: string[] = [];

  // Header metadata
  lines.push(`Trial Balance — ${csvEscape(entity.name)} — as of ${asOfDateStr}`);
  lines.push(`Currency,${entity.baseCurrency ?? "USD"}`);
  lines.push("");

  if (gross) {
    lines.push("Code,Account,Type,Total Debits,Total Credits");
    for (const r of tb.rows) {
      lines.push(
        [
          csvEscape(r.code),
          csvEscape(r.name),
          r.type,
          formatCents(r.debitCents),
          formatCents(r.creditCents),
        ].join(",")
      );
    }
    lines.push("");
    lines.push(
      `Totals,,,${formatCents(tb.totalDebits)},${formatCents(tb.totalCredits)}`
    );
  } else {
    const balanceRows = toBalanceStyleRows(tb);
    lines.push("Code,Account,Type,Debit,Credit");
    for (const r of balanceRows) {
      lines.push(
        [
          csvEscape(r.code),
          csvEscape(r.name),
          r.type,
          formatCents(r.drBalance),
          formatCents(r.crBalance),
        ].join(",")
      );
    }
    const totalDr = balanceRows.reduce((s, r) => s + r.drBalance, 0n);
    const totalCr = balanceRows.reduce((s, r) => s + r.crBalance, 0n);
    lines.push("");
    lines.push(`Totals,,,${formatCents(totalDr)},${formatCents(totalCr)}`);
  }

  lines.push("");
  lines.push(
    `Balanced,${tb.balanced ? "Yes" : "No"}${tb.balanced ? "" : `,Difference,${formatCents(tb.difference)}`}`
  );

  const csv = lines.join("\n");
  const filename = `trial-balance-${entity.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${asOfDateStr}${gross ? "-gross" : ""}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
