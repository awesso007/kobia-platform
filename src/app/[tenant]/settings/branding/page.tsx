import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { updateTenantBranding } from "@/app/actions/tenant-settings-actions";

export const dynamic = "force-dynamic";

export default async function BrandingPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const t = auth.tenant;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold text-slate-900">Branding</h1>
      <p className="mt-1 text-sm text-slate-500">
        Customize how KOBIA looks for your team and clients.
      </p>

      <form action={updateTenantBranding} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <input type="hidden" name="tenantSlug" value={params.tenant} />

        <div>
          <label className="block text-sm font-medium text-slate-900">Workspace name</label>
          <input
            type="text"
            name="name"
            defaultValue={t.name}
            required
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900">Legal name</label>
          <input
            type="text"
            name="legalName"
            defaultValue={t.legalName ?? ""}
            placeholder="Optional"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900">Logo URL</label>
          <input
            type="url"
            name="logoUrl"
            defaultValue={t.logoUrl ?? ""}
            placeholder="https://…/logo.png"
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-xs text-slate-500">
            Paste a public URL. Used on invoices, statements, and the client portal.
          </p>
          {t.logoUrl ? (
            <img
              src={t.logoUrl}
              alt="Logo preview"
              className="mt-3 h-12 rounded border border-slate-200 bg-white object-contain p-1"
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-900">Primary color</label>
            <input
              type="color"
              name="primaryColor"
              defaultValue={t.primaryColor ?? "#0F172A"}
              className="mt-1 h-10 w-full rounded-md border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-900">Secondary color</label>
            <input
              type="color"
              name="secondaryColor"
              defaultValue={t.secondaryColor ?? "#3B82F6"}
              className="mt-1 h-10 w-full rounded-md border border-slate-200"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Save branding
          </button>
        </div>
      </form>
    </div>
  );
}
