/**
 * General Ledger CSV export.
 *
 * Query params:
 *   entity   — required, entity id
 *   account  — required, account id
 *   start    — optional ISO date (YYYY-MM-DD), defaults to Jan 1 current year
 *   end      — optional ISO date (YYYY-MM-DD), defaults to today
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/accounting/ledger";
import { buildGeneralLedger } from "@/lib/accounting/general-ledger";

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
  const accountId = url.searchParams.get("account");
  const startStr = url.searchParams.get("start");
  const endStr = url.searchParams.get("end");

  if (!entityId || !accountId) {
    return new NextResponse("Missing entity or account", { status: 400 });
  }

  const entity = await db.entity.findUnique({
    where: { id: entityId },
    include: { tenant: true },
  });
  if (!entity) return new NextResponse("Entity not found", { status: 404 });

  const auth = await getAuthContext(entity.tenant.slug);
  if (!auth || auth.tenant.id !== entity.tenantId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const today = new Date();
  const startDate = startStr
    ? new Date(startStr + "T00:00:00")
    : new Date(today.getFullYear(), 0, 1);
  const endDate = endStr ? new Date(endStr + "T23:59:59") : today;

  const gl = await buildGeneralLedger({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    accountId,
    startDate,
    endDate,
  });
  if (!gl) return new NextResponse("Account not found", { status: 404 });

  const startDateStr = startDate.toISOString().slice(0, 10);
  const endDateStr = endDate.toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(
    `General Ledger — ${csvEscape(entity.name)} — ${csvEscape(gl.code)} ${csvEscape(gl.name)}`
  );
  lines.push(`Period,${startDateStr} to ${endDateStr}`);
  lines.push(`Currency,${entity.baseCurrency ?? "USD"}`);
  lines.push("");
  lines.push("Date,JE #,Source,Description,Debit,Credit,Running Balance");
  lines.push(
    `${startDateStr},,,Opening balance,,,${formatCents(gl.openingBalance)}`
  );
  for (const l of gl.lines) {
    lines.push(
      [
        l.entryDate.toISOString().slice(0, 10),
        l.entryNumber.toString(),
        l.source,
        csvEscape(l.description ?? l.lineMemo ?? l.memo ?? ""),
        l.debitCents > 0n ? formatCents(l.debitCents) : "",
        l.creditCents > 0n ? formatCents(l.creditCents) : "",
        formatCents(l.runningBalance),
      ].join(",")
    );
  }
  lines.push("");
  lines.push(
    `Totals,,,${formatCents(gl.totalDebits)},${formatCents(gl.totalCredits)},${formatCents(gl.closingBalance)}`
  );

  const csv = lines.join("\n");
  const safeName = `${gl.code}-${gl.name}`.replace(/[^a-zA-Z0-9]+/g, "-");
  const filename = `general-ledger-${safeName}-${startDateStr}-to-${endDateStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
