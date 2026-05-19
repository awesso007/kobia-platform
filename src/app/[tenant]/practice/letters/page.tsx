import Link from "next/link";
import { redirect } from "next/navigation";
import type { LetterStatus } from "@prisma/client";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-sky-100 text-sky-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  VOIDED: "bg-rose-100 text-rose-800",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default async function LettersPage({
  params,
  searchParams,
}: {
  params: { tenant: string };
  searchParams?: { status?: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const filter = searchParams?.status ?? "ALL";

  const where = {
    tenantId: auth.tenant.id,
    ...(filter !== "ALL"
      ? { status: filter as LetterStatus }
      : {}),
  };

  const [letters, counts] = await Promise.all([
    db.engagementLetter.findMany({
      where,
      include: {
        engagement: {
          select: {
            id: true,
            name: true,
            entity: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.engagementLetter.groupBy({
      by: ["status"],
      where: { tenantId: auth.tenant.id },
      _count: { _all: true },
    }),
  ]);

  const total = counts.reduce((s, c) => s + c._count._all, 0);
  const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));

  const filterTabs: { value: string; label: string; count: number }[] = [
    { value: "ALL", label: "All", count: total },
    { value: "DRAFT", label: "Draft", count: byStatus.get("DRAFT") ?? 0 },
    { value: "SENT", label: "Sent", count: byStatus.get("SENT") ?? 0 },
    { value: "SIGNED", label: "Signed", count: byStatus.get("SIGNED") ?? 0 },
    { value: "VOIDED", label: "Voided", count: byStatus.get("VOIDED") ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Engagement letters
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All letters generated from templates across every engagement.
          </p>
        </div>
        <Link
          href={`/${params.tenant}/practice/templates`}
          className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          Templates →
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {filterTabs.map((t) => {
          const active = filter === t.value;
          return (
            <Link
              key={t.value}
              href={`/${params.tenant}/practice/letters?status=${t.value}`}
              className={`rounded-full px-3 py-1 ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label} · {t.count}
            </Link>
          );
        })}
      </div>

      {letters.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No letters yet. Generate one from an engagement page.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-4 py-2 font-medium">Engagement</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Signer</th>
                <th className="px-4 py-2 font-medium">Sent</th>
                <th className="px-4 py-2 font-medium">Signed</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((l) => (
                <tr key={l.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/${params.tenant}/practice/letters/${l.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {l.subject}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    <Link
                      href={`/${params.tenant}/practice/engagements/${l.engagement.id}`}
                      className="hover:underline"
                    >
                      {l.engagement.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {l.engagement.entity.name}
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
                    {l.signerEmail && (
                      <div className="text-slate-400">{l.signerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {fmtDate(l.sentAt)}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {fmtDate(l.signedAt)}
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
