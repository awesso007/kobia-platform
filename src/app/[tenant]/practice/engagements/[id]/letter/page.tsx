import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateLetterAction } from "@/app/actions/letter-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-sky-100 text-sky-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  VOIDED: "bg-rose-100 text-rose-800",
};

export default async function EngagementLetterPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const engagement = await db.engagement.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: { entity: { select: { name: true } } },
  });
  if (!engagement) notFound();

  const [templates, letters] = await Promise.all([
    db.engagementLetterTemplate.findMany({
      where: { tenantId: auth.tenant.id, isActive: true },
      orderBy: [{ engagementType: "asc" }, { name: "asc" }],
    }),
    db.engagementLetter.findMany({
      where: { tenantId: auth.tenant.id, engagementId: engagement.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Prefer same-type templates first
  const sortedTemplates = [
    ...templates.filter((t) => t.engagementType === engagement.type),
    ...templates.filter((t) => t.engagementType !== engagement.type),
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/practice/engagements/${engagement.id}`}
          className="hover:underline"
        >
          {engagement.name}
        </Link>
        <span>/</span>
        <span className="text-slate-700">Letter</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">
        Generate engagement letter
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        For <span className="font-medium text-slate-700">{engagement.entity.name}</span>{" "}
        — {engagement.type.toLowerCase()} engagement.
      </p>

      {/* Generate form */}
      <form
        action={generateLetterAction}
        className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="tenantSlug" value={params.tenant} />
        <input type="hidden" name="engagementId" value={engagement.id} />

        <label className="block">
          <span className="text-xs font-medium text-slate-700">Template *</span>
          <select
            name="templateId"
            required
            defaultValue={sortedTemplates[0]?.id ?? ""}
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            {sortedTemplates.length === 0 && (
              <option value="">— No templates yet —</option>
            )}
            {sortedTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{" "}
                {t.engagementType !== engagement.type
                  ? `(${t.engagementType.toLowerCase()})`
                  : ""}
              </option>
            ))}
          </select>
          {sortedTemplates.length === 0 && (
            <p className="mt-1 text-xs text-rose-600">
              You need to create a template first.{" "}
              <Link
                href={`/${params.tenant}/practice/templates`}
                className="underline"
              >
                Go to templates →
              </Link>
            </p>
          )}
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Signer name
            </span>
            <input
              name="signerName"
              maxLength={120}
              placeholder="Jane Doe"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Signer email
            </span>
            <input
              name="signerEmail"
              type="email"
              maxLength={200}
              placeholder="jane@acme.com"
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-700">
            Fee text override (optional)
          </span>
          <input
            name="feeText"
            maxLength={200}
            placeholder="$2,500 flat fee"
            className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={sortedTemplates.length === 0}
            className="rounded-md bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-lime-300 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            Generate letter
          </button>
        </div>
      </form>

      {/* Existing letters on this engagement */}
      {letters.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-slate-700">
            Letters on this engagement
          </h2>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Signer</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {letters.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <Link
                        href={`/${params.tenant}/practice/letters/${l.id}`}
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {l.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-xs ${
                          STATUS_BADGE[l.status] ?? "bg-slate-100"
                        }`}
                      >
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {l.signerName ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">
                      {new Date(l.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
