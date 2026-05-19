import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  get1099MiscRows,
  totalsByBox,
  MISC_BOXES,
  MISC_BOX_LABELS,
  MISC_BOX_THRESHOLDS,
} from "@/lib/accounting/tax-1099-misc";

export const dynamic = "force-dynamic";

export default async function Tax1099MiscPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams: { year?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const now = new Date();
  const year = Number(searchParams.year ?? now.getUTCFullYear());

  const rows = await get1099MiscRows({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    year,
  });

  const totals = totalsByBox(rows);
  const grandTotal = MISC_BOXES.reduce((s, b) => s + (totals[b] ?? 0n), 0n);
  const reportableVendors = rows.filter((r) => r.reportableBoxes.length > 0);
  const missingW9Count = reportableVendors.filter((r) => r.missingW9).length;
  const anyUnassigned = rows.some((r) => r.unassigned > 0n);

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/dashboard`} className="hover:text-slate-700">
          ← Back to dashboard
        </Link>
        <span className="mx-2">·</span>
        <Link href={`/${params.tenant}/tax/1099`} className="hover:text-slate-700">
          1099-NEC
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">1099-MISC Preparation</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · Tax year {year} · Rent / Royalties / Other Income
          </p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">Year</label>
          <select
            name="year"
            defaultValue={year}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {[year + 1, year, year - 1, year - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Apply
          </button>
          <a
            href={`/api/reports/1099-misc.csv?tenant=${params.tenant}&entityId=${entity.id}&year=${year}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Card label="MISC Vendors" value={`${rows.length}`} />
        <Card label="Reportable" value={`${reportableVendors.length}`} />
        {MISC_BOXES.map((b) => (
          <Card
            key={b}
            label={`Box ${b} ${MISC_BOX_LABELS[b]}`}
            value={formatCents(totals[b] ?? 0n)}
          />
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card label="Grand Total" value={formatCents(grandTotal)} accent />
        <Card
          label="Missing W-9"
          value={`${missingW9Count}`}
          warn={missingW9Count > 0}
        />
        <Card
          label="Unassigned $"
          value={anyUnassigned ? "Yes — set Account boxes" : "All allocated"}
          warn={anyUnassigned}
        />
      </div>

      {anyUnassigned && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Some payments are unallocated.</p>
          <p className="mt-1 text-amber-700">
            Open your Chart of Accounts and set the 1099-MISC Box (1=Rents, 2=Royalties, 3=Other,
            6=Medical, 14=Gross Atty) on each expense account that should appear on a 1099-MISC.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Tax ID</th>
              {MISC_BOXES.map((b) => (
                <th key={b} className="px-3 py-2 text-right font-medium">
                  Box {b}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Unassigned</th>
              <th className="px-4 py-2 text-right font-medium">Paid YTD</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={MISC_BOXES.length + 5} className="px-4 py-8 text-center text-slate-400">
                  No vendors flagged as 1099-MISC. Open a vendor and check &ldquo;Issue 1099-MISC&rdquo; to track.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.vendorId} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link
                      href={`/${params.tenant}/ap/vendors/${r.vendorId}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {r.vendorName}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.taxId ? (
                      <span className="font-mono text-xs">{maskTaxId(r.taxId)}</span>
                    ) : (
                      <span className="text-amber-600">Missing</span>
                    )}
                  </td>
                  {MISC_BOXES.map((b) => {
                    const amt = r.byBox[b] ?? 0n;
                    const threshold = MISC_BOX_THRESHOLDS[b] ?? 60000n;
                    const meets = amt >= threshold;
                    return (
                      <td
                        key={b}
                        className={`px-3 py-2 text-right tabular-nums ${
                          meets ? "font-semibold text-slate-900" : "text-slate-400"
                        }`}
                      >
                        {amt > 0n ? formatCents(amt) : "—"}
                      </td>
                    );
                  })}
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.unassigned > 0n ? "text-amber-700" : "text-slate-400"
                    }`}
                  >
                    {r.unassigned > 0n ? formatCents(r.unassigned) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {formatCents(r.paidYTD)}
                  </td>
                  <td className="px-4 py-2">
                    {r.reportableBoxes.length > 0 ? (
                      <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        Box {r.reportableBoxes.join(", ")}
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Below threshold
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">
          Thresholds: Box 1/3/6 = $600 · Box 2 (Royalties) = $10 · Box 14 (Atty) = $0
        </p>
        <p className="mt-1">
          Assign each expense account a 1099-MISC box in your Chart of Accounts. KOBIA
          allocates each vendor payment to boxes proportionally based on the bill&rsquo;s line
          accounts. Filing deadline: January 31 (recipient copy) / February 28 (paper) /
          March 31 (electronic).
        </p>
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        warn
          ? "border-amber-200 bg-amber-50"
          : accent
            ? "border-slate-300 bg-slate-50"
            : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold ${warn ? "text-amber-700" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function maskTaxId(taxId: string): string {
  const clean = taxId.replace(/\D/g, "");
  if (clean.length < 4) return "•••";
  const last4 = clean.slice(-4);
  if (clean.length === 9) return `•••-••-${last4}`;
  return `••-•••${last4}`;
}
