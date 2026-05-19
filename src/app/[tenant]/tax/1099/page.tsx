import { redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { formatCents } from "@/lib/accounting/ledger";
import {
  sendAllMissingW9RequestsAction,
  sendW9RequestAction,
} from "@/app/actions/w9-actions";

export const dynamic = "force-dynamic";

// IRS 1099-NEC threshold for non-employee compensation
const THRESHOLD_CENTS = 60000n; // $600

export default async function Tax1099Page({
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
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  // Pull all 1099-flagged vendors and their bill payments in window.
  const vendors = await db.vendor.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      is1099Vendor: true,
    },
    include: {
      bills: {
        select: {
          id: true,
          billNumber: true,
          paidCents: true,
          payments: {
            where: {
              paymentDate: { gte: yearStart, lt: yearEnd },
            },
            select: {
              amountCents: true,
              paymentDate: true,
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = vendors.map((v) => {
    const paidYTD = v.bills.reduce(
      (sum, b) => sum + b.payments.reduce((s, p) => s + p.amountCents, 0n),
      0n,
    );
    return {
      id: v.id,
      name: v.name,
      email: v.email,
      taxId: v.taxId,
      paidYTD,
      meetsThreshold: paidYTD >= THRESHOLD_CENTS,
      missingW9: !v.taxId,
      paymentCount: v.bills.reduce((s, b) => s + b.payments.length, 0),
    };
  });

  // Read transient W-9 send result cookie (set by server action)
  const w9ResultCookie = cookies().get("kobia_w9_result");
  let w9Result: { sent: number; failed: number; stubbed: boolean; total: number } | null = null;
  if (w9ResultCookie) {
    try {
      w9Result = JSON.parse(w9ResultCookie.value);
    } catch {
      w9Result = null;
    }
  }

  const reportable = rows.filter((r) => r.meetsThreshold);
  const totalReportable = reportable.reduce((s, r) => s + r.paidYTD, 0n);
  const missingW9Count = reportable.filter((r) => r.missingW9).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/dashboard`} className="hover:text-slate-700">
          ← Back to dashboard
        </Link>
      </div>

      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">1099 Preparation</h1>
          <p className="mt-1 text-sm text-slate-500">
            {entity.name} · Tax year {year} · IRS threshold $600
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
            href={`/api/reports/1099-nec.csv?tenant=${params.tenant}&entityId=${entity.id}&year=${year}`}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </a>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card label="1099 Vendors" value={`${rows.length}`} />
        <Card label="Reportable (≥ $600)" value={`${reportable.length}`} />
        <Card label="Total Reportable" value={formatCents(totalReportable)} accent />
        <Card
          label="Missing W-9"
          value={`${missingW9Count}`}
          warn={missingW9Count > 0}
        />
      </div>

      {w9Result && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">
            Sent {w9Result.sent} W-9 request{w9Result.sent === 1 ? "" : "s"}.
            {w9Result.failed > 0 && ` ${w9Result.failed} failed (missing email or send error).`}
            {w9Result.stubbed && " (Email stubbed — configure RESEND_API_KEY to send live.)"}
          </p>
        </div>
      )}

      {missingW9Count > 0 && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div>
            <p className="font-medium">Action needed: {missingW9Count} vendor(s) missing W-9 / Tax ID.</p>
            <p className="mt-1 text-amber-700">
              You can&apos;t file a 1099-NEC without a TIN. Request a W-9 from each vendor before
              January 31.
            </p>
          </div>
          <form action={sendAllMissingW9RequestsAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="year" value={year} />
            <button
              type="submit"
              className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Request all W-9s
            </button>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Vendor</th>
              <th className="px-4 py-2 font-medium">Tax ID</th>
              <th className="px-4 py-2 text-right font-medium">Paid YTD</th>
              <th className="px-4 py-2 text-right font-medium">Payments</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No vendors flagged as 1099. Open a vendor and check &ldquo;Issue 1099&rdquo; to track.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${params.tenant}/ap/vendors/${r.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.meetsThreshold && (
                        <Link
                          href={`/${params.tenant}/tax/1099/${r.id}?year=${year}`}
                          className="text-xs font-medium text-blue-700 hover:underline"
                        >
                          1099-NEC →
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.taxId ? (
                      <span className="font-mono text-xs">{maskTaxId(r.taxId)}</span>
                    ) : (
                      <span className="text-amber-600">Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCents(r.paidYTD)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {r.paymentCount}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {r.meetsThreshold ? (
                        <span className="inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Reportable
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                          Below threshold
                        </span>
                      )}
                      {r.missingW9 && r.meetsThreshold && r.email && (
                        <form action={sendW9RequestAction}>
                          <input type="hidden" name="tenantSlug" value={params.tenant} />
                          <input type="hidden" name="vendorId" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                          >
                            Request W-9
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-700">Preview · 1099-NEC e-file coming later in Cycle 4</p>
        <p className="mt-1">
          Next: IRS FIRE / IRIS e-file submission, recipient PDF generation, and state-level
          filings (CA, NY, etc.).
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
      className={`rounded-lg border p-4 ${
        warn
          ? "border-amber-200 bg-amber-50"
          : accent
            ? "border-slate-300 bg-slate-50"
            : "border-slate-200 bg-white"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? "text-amber-700" : "text-slate-900"}`}>
        {value}
      </p>
    </div>
  );
}

function maskTaxId(taxId: string): string {
  const clean = taxId.replace(/\D/g, "");
  if (clean.length < 4) return "•••";
  const last4 = clean.slice(-4);
  // Format: XX-XXX•••• (EIN style) or •••-••-XXXX (SSN style by length)
  if (clean.length === 9) return `•••-••-${last4}`;
  return `••-•••${last4}`;
}
