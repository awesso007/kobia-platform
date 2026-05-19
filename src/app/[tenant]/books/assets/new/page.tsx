import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import { db } from "@/lib/db";
import { createFixedAssetAction } from "@/app/actions/fixed-asset-actions";

export const dynamic = "force-dynamic";

export default async function NewFixedAssetPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  const accounts = await db.account.findMany({
    where: { entityId: entity.id, isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true, subtype: true },
  });

  const assetAccounts = accounts.filter((a) => a.type === "ASSET");
  const expenseAccounts = accounts.filter((a) => a.type === "EXPENSE");
  // For funding (the credit side of capitalization): cash/AP/liability accounts are the typical choices.
  const fundingAccounts = accounts.filter(
    (a) => a.type === "ASSET" || a.type === "LIABILITY"
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link
        href={`/${params.tenant}/books/assets`}
        className="text-sm text-slate-500 hover:underline dark:text-slate-400"
      >
        &larr; Back to assets
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
        Add fixed asset
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Capitalize a long-term asset and tell KOBIA how to depreciate it. We&apos;ll post a monthly
        journal entry automatically.
      </p>

      <form action={createFixedAssetAction} className="mt-8 space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <input type="hidden" name="slug" value={params.tenant} />

        {/* Basic info */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Asset details
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
              <input
                type="text"
                name="name"
                required
                placeholder="e.g. 2024 Ford Transit"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-[color:var(--primary,#0ea5e9)] focus:outline-none focus:ring-1 focus:ring-[color:var(--primary,#0ea5e9)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
              <select
                name="category"
                defaultValue="Equipment"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              >
                <option>Equipment</option>
                <option>Vehicle</option>
                <option>Computer</option>
                <option>Furniture</option>
                <option>Building</option>
                <option>Leasehold improvement</option>
                <option>Software</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">In-service date</label>
              <input
                type="date"
                name="acquisitionDate"
                required
                defaultValue={today}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description (optional)</label>
              <textarea
                name="description"
                rows={2}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
          </div>
        </section>

        {/* Costs */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cost &amp; depreciation
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Total cost ($)</label>
              <input
                type="text"
                name="cost"
                required
                inputMode="decimal"
                placeholder="40000.00"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Salvage value ($)</label>
              <input
                type="text"
                name="salvage"
                inputMode="decimal"
                defaultValue="0.00"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Useful life (months)</label>
              <select
                name="usefulLifeMonths"
                defaultValue="60"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              >
                <option value="36">36 (3 yr — computers)</option>
                <option value="60">60 (5 yr — vehicles, equipment)</option>
                <option value="84">84 (7 yr — furniture)</option>
                <option value="180">180 (15 yr — improvements)</option>
                <option value="360">360 (30 yr — buildings)</option>
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Straight-line method. We&apos;ll divide (cost − salvage) by months and post that every month.
          </p>
        </section>

        {/* Account mapping */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Chart of accounts mapping
          </h2>
          <div className="mt-3 space-y-4">
            <AccountSelect
              label="Asset account (where the asset lives on the balance sheet)"
              name="assetAccountId"
              accounts={assetAccounts}
              required
            />
            <AccountSelect
              label="Accumulated depreciation (contra-asset)"
              name="accumulatedDepreciationAccountId"
              accounts={assetAccounts}
              required
              hint="Pick or create a contra-asset under the same parent. Many CoAs use 1799 'Accumulated Depreciation'."
            />
            <AccountSelect
              label="Depreciation expense (P&L)"
              name="depreciationExpenseAccountId"
              accounts={expenseAccounts}
              required
            />
            <AccountSelect
              label="Funding account (credit side of capitalization — optional)"
              name="fundingAccountId"
              accounts={fundingAccounts}
              hint="Leave blank if you don't want to post the purchase JE now (already recorded via bank import, for example)."
            />
          </div>
        </section>

        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Link
            href={`/${params.tenant}/books/assets`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-[color:var(--primary,#0ea5e9)] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          >
            Create asset
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountSelect({
  label,
  name,
  accounts,
  required,
  hint,
}: {
  label: string;
  name: string;
  accounts: { id: string; code: string; name: string; type: string; subtype: string | null }[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </label>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
      >
        <option value="">Select account…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} — {a.name}
            {a.subtype ? ` (${a.subtype})` : ""}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  );
}
