import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function createCustomer(tenantSlug: string, formData: FormData) {
  "use server";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Not authenticated");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Only owners, admins, and accountants can create customers.");
  }

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity. Create one first.");

  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim() || null;
  const phone = (formData.get("phone") as string | null)?.trim() || null;
  const termsStr = formData.get("defaultTermsDays") as string | null;
  const defaultTermsDays = termsStr ? parseInt(termsStr, 10) : 30;
  const billingAddress = (formData.get("billingAddress") as string | null)?.trim() || null;
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!name) throw new Error("Customer name is required.");
  if (Number.isNaN(defaultTermsDays) || defaultTermsDays < 0 || defaultTermsDays > 365) {
    throw new Error("Terms must be between 0 and 365 days.");
  }

  try {
    const created = await db.customer.create({
      data: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        name,
        email,
        phone,
        defaultTermsDays,
        billingAddress,
        notes,
      },
    });
    revalidatePath(`/${tenantSlug}/ar/customers`);
    redirect(`/${tenantSlug}/ar/customers/${created.id}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique")) {
      throw new Error(`A customer named "${name}" already exists for this entity.`);
    }
    throw err;
  }
}

export default async function NewCustomerPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/ar/customers`);
  }

  const action = createCustomer.bind(null, params.tenant);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ar/customers`} className="hover:text-slate-700">
          ← Back to customers
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">New Customer</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add a customer to start sending invoices and tracking AR.
      </p>

      <form action={action} className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name *</span>
          <input
            type="text"
            name="name"
            required
            maxLength={200}
            placeholder="Acme Properties LLC"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Email</span>
            <input
              type="email"
              name="email"
              maxLength={200}
              placeholder="billing@acme.com"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Phone</span>
            <input
              type="tel"
              name="phone"
              maxLength={50}
              placeholder="(555) 123-4567"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Default payment terms</span>
          <select
            name="defaultTermsDays"
            defaultValue="30"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="0">Due on receipt</option>
            <option value="15">Net 15</option>
            <option value="30">Net 30</option>
            <option value="45">Net 45</option>
            <option value="60">Net 60</option>
            <option value="90">Net 90</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            Used to compute invoice due dates automatically.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Billing address</span>
          <textarea
            name="billingAddress"
            rows={3}
            maxLength={500}
            placeholder="123 Main St&#10;Suite 400&#10;Murrieta, CA 92562"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder="Optional internal notes about this customer."
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link
            href={`/${params.tenant}/ar/customers`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create customer
          </button>
        </div>
      </form>
    </div>
  );
}
