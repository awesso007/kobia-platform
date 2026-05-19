import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  createTemplateAction,
  deleteTemplateAction,
} from "@/app/actions/letter-actions";
import { AVAILABLE_VARIABLES } from "@/lib/practice/letter-variables";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  BOOKKEEPING: "Bookkeeping",
  TAX: "Tax",
  PAYROLL: "Payroll",
  AUDIT: "Audit",
  ADVISORY: "Advisory",
  ONBOARDING: "Onboarding",
  OTHER: "Other",
};

export default async function TemplatesPage({
  params,
}: {
  params: { tenant: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const templates = await db.engagementLetterTemplate.findMany({
    where: { tenantId: auth.tenant.id },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Engagement letter templates
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Reusable letter templates with variable substitution. Drop in{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">
              {"{{client_name}}"}
            </code>
            ,{" "}
            <code className="rounded bg-slate-100 px-1 text-xs">
              {"{{fee_text}}"}
            </code>
            , and more.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/practice/letters`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          All letters →
        </Link>
      </div>

      {/* Create form */}
      <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          + New template
        </summary>
        <form action={createTemplateAction} className="mt-4 grid gap-3">
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Template name *
              </span>
              <input
                name="name"
                required
                maxLength={120}
                placeholder="2026 Tax Return Letter"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Engagement type
              </span>
              <select
                name="engagementType"
                defaultValue="BOOKKEEPING"
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              >
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Subject *</span>
            <input
              name="subject"
              required
              maxLength={200}
              placeholder="Engagement Letter — {{engagement_name}}"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Body (Markdown) *
            </span>
            <textarea
              name="bodyMarkdown"
              required
              rows={12}
              placeholder={
                "Dear {{client_name}},\n\nThis letter confirms our engagement to provide {{engagement_type}} services beginning {{start_date}}.\n\nFee: {{fee_text}}\n\nSincerely,\n{{firm_name}}"
              }
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Default fee text (optional)
            </span>
            <input
              name="feeText"
              maxLength={200}
              placeholder="$2,500 flat fee"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>

          {/* Variable picker */}
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">
              Available variables (click to copy)
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AVAILABLE_VARIABLES.map((v) => (
                <code
                  key={v.key}
                  className="cursor-text rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-700"
                  title={v.label}
                >
                  {v.key}
                </code>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-lime-300"
            >
              Create template
            </button>
          </div>
        </form>
      </details>

      {/* List */}
      {templates.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No templates yet. Create your first one above.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Fee</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{t.name}</div>
                    <p className="line-clamp-1 text-xs text-slate-400">
                      {t.subject}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {TYPE_LABEL[t.engagementType] ?? t.engagementType}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {t.feeText ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {t.isActive ? (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.isActive && (
                      <form action={deleteTemplateAction} className="inline">
                        <input
                          type="hidden"
                          name="tenantSlug"
                          value={params.tenant}
                        />
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-rose-600 hover:underline"
                        >
                          Archive
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
