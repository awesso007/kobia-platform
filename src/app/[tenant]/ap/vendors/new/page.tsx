import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveEntity } from "@/lib/active-entity";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function createVendor(tenantSlug: string, formData: FormData) {
  "use server";
  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Not authenticated");
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    throw new Error("Only owners, admins, and accountants can create vendors.");
  }

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity. Create one first.");

  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim() || null;
  const phone = (formData.get("phone") as string | null)?.trim() || null;
  const termsStr = formData.get("defaultTermsDays") as string | null;
  const defaultTermsDays = termsStr ? parseInt(termsStr, 10) : 30;
  const remitToAddress = (formData.get("remitToAddress") as string | null)?.trim() || null;
  const taxId = (formData.get("taxId") as string | null)?.trim() || null;
  const is1099Vendor = formData.get("is1099Vendor") === "on";
  const notes = (formData.get("notes") as string | null)?.trim() || null;

  if (!name) throw new Error("Vendor name is required.");
  if (Number.isNaN(defaultTermsDays) || defaultTermsDays < 0 || defaultTermsDays > 365) {
    throw new Error("Terms must be between 0 and 365 days.");
  }

  try {
    const created = await db.vendor.create({
      data: {
        tenantId: auth.tenant.id,
        entityId: entity.id,
        name,
        email,
        phone,
        defaultTermsDays,
        remitToAddress,
        taxId,
        is1099Vendor,
        notes,
      },
    });
    revalidatePath(`/${tenantSlug}/ap/vendors`);
    redirect(`/${tenantSlug}/ap/vendors/${created.id}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique")) {
      throw new Error(`A vendor named "${name}" already exists for this entity.`);
    }
    throw err;
  }
}

export default async function NewVendorPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);
  if (!["OWNER", "ADMIN", "ACCOUNTANT"].includes(auth.role)) {
    redirect(`/${params.tenant}/ap/vendors`);
  }

  const action = createVendor.bind(null, params.tenant);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 text-sm text-slate-500">
        <Link href={`/${params.tenant}/ap/vendors`} className="hover:text-slate-700">
          ← Back to vendors
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">New Vendor</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add a vendor to start tracking bills and payments.
      </p>

      <form
        action={action}
        className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Name *</span>
          <input
            type="text"
            name="name"
            required
            maxLength={200}
            placeholder="Acme Supplies, Inc."
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
              placeholder="ap@acme.com"
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
            Used to compute bill due dates automatically.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Remit-to address</span>
          <textarea
            name="remitToAddress"
            rows={3}
            maxLength={500}
            placeholder="123 Main St&#10;Suite 400&#10;Murrieta, CA 92562"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Tax ID / EIN</span>
            <input
              type="text"
              name="taxId"
              maxLength={50}
              placeholder="12-3456789"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </label>

          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              name="is1099Vendor"
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">1099 vendor</span>
          </label>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Notes</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            placeholder="Optional internal notes about this vendor."
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Link
            href={`/${params.tenant}/ap/vendors`}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create vendor
          </button>
        </div>
      </form>
    </div>
  );
}
