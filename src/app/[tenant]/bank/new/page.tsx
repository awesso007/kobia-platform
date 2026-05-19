import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";

export const dynamic = "force-dynamic";

async function createBankAccount(tenantSlug: string, formData: FormData) {
  "use server";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Not authenticated");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Only owners, admins, and accountants can create bank accounts.");
  }
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity.");

  const name = (formData.get("name") as string | null)?.trim();
  const institution = (formData.get("institution") as string | null)?.trim() || null;
  const accountLast4 = (formData.get("accountLast4") as string | null)?.trim() || null;
  const accountType = (formData.get("accountType") as string) || "CHECKING";
  const glAccountId = formData.get("glAccountId") as string;
  const openingBalance = (formData.get("openingBalance") as string | null)?.trim();

  if (!name) throw new Error("Name required.");
  if (!glAccountId) throw new Error("GL account required.");

  // Validate GL account
  const gl = await db.account.findFirst({
    where: { id: glAccountId, entityId: entity.id, tenantId: auth.tenant.id },
  });
  if (!gl) throw new Error("GL account not found.");
  if (gl.type !== "ASSET" && gl.type !== "LIABILITY") {
    throw new Error("Bank accounts must link to an ASSET or LIABILITY GL account.");
  }

  // Parse opening balance dollars → cents
  let openingBalanceCents: bigint = 0n;
  if (openingBalance) {
    const cleaned = openingBalance.replace(/[$,\s]/g, "");
    if (!/^-?\d*(\.\d{1,2})?$/.test(cleaned)) {
      throw new Error("Opening balance must be a valid amount.");
    }
    const neg = cleaned.startsWith("-");
    const body = neg ? cleaned.slice(1) : cleaned;
    const [whole = "0", frac = ""] = body.split(".");
    const cents = BigInt(whole) * 100n + BigInt((frac.padEnd(2, "0").slice(0, 2)) || "0");
    openingBalanceCents = neg ? -cents : cents;
  }

  try {
    const bank = await db.bankAccount.create({
      data: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        glAccountId,
        name,
        institution,
        accountLast4,
        accountType: accountType as
          | "CHECKING"
          | "SAVINGS"
          | "CREDIT_CARD"
          | "MONEY_MARKET"
          | "LOAN"
          | "OTHER",
        openingBalanceCents,
      },
    });
    revalidatePath(`/${tenantSlug}/bank`);
    redirect(`/${tenantSlug}/bank/${bank.id}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique")) {
      throw new Error("That GL account is already linked to a bank account.");
    }
    throw err;
  }
}

export default async function NewBankAccountPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/bank`);
  }
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug: params.tenant });
  if (!entity) redirect(`/${params.tenant}/books`);

  // Pull eligible GL accounts (ASSET or LIABILITY) that aren't already linked
  const eligible = await db.account.findMany({
    where: {
      tenantId: auth.tenant.id,
      entityId: entity.id,
      type: { in: ["ASSET", "LIABILITY"] },
      isActive: true,
      bankAccounts: { none: {} },
    },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });

  const action = createBankAccount.bind(null, params.tenant);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/bank`} className="hover:text-slate-700">
          ← Back to bank accounts
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">New Bank Account</h1>
      <p className="mt-1 text-sm text-slate-500">
        Link a real-world bank or credit card account to a GL account. We&apos;ll keep them in
        lockstep when you import statements and reconcile.
      </p>

      {eligible.length === 0 ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">No eligible GL accounts available.</p>
          <p className="mt-1">
            Every existing asset or liability account is already linked to a bank account. Create
            a new GL account in your chart of accounts first.
          </p>
        </div>
      ) : (
        <form
          action={action}
          className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account name *</span>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              placeholder="Chase Business Checking"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Institution</span>
              <input
                type="text"
                name="institution"
                maxLength={100}
                placeholder="Chase, BofA, Wells Fargo..."
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Last 4 digits</span>
              <input
                type="text"
                name="accountLast4"
                maxLength={10}
                placeholder="1234"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Account type *</span>
            <select
              name="accountType"
              defaultValue="CHECKING"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="CHECKING">Checking</option>
              <option value="SAVINGS">Savings</option>
              <option value="CREDIT_CARD">Credit Card</option>
              <option value="MONEY_MARKET">Money Market</option>
              <option value="LOAN">Loan</option>
              <option value="OTHER">Other</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Linked GL account *</span>
            <select
              name="glAccountId"
              required
              defaultValue=""
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="" disabled>
                Select a GL account...
              </option>
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name} ({a.type})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-slate-500">
              Only ASSET or LIABILITY accounts not already linked are shown.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Opening balance</span>
            <input
              type="text"
              name="openingBalance"
              placeholder="0.00"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Optional reference balance for the start of your imports. Doesn&apos;t post any JE.
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Link
              href={`/${params.tenant}/bank`}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create bank account
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
