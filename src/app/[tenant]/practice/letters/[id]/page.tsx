import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  updateLetterDraftAction,
  sendLetterAction,
  voidLetterAction,
} from "@/app/actions/letter-actions";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SENT: "bg-sky-100 text-sky-800",
  SIGNED: "bg-emerald-100 text-emerald-800",
  VOIDED: "bg-rose-100 text-rose-800",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

export default async function LetterDetailPage({
  params,
}: {
  params: { tenant: string; id: string };
}) {
  const auth = await getAuthContext(params.tenant);
  if (!auth) redirect(`/${params.tenant}/login`);

  const letter = await db.engagementLetter.findFirst({
    where: { id: params.id, tenantId: auth.tenant.id },
    include: {
      engagement: {
        include: { entity: { select: { name: true } } },
      },
    },
  });
  if (!letter) notFound();

  const isDraft = letter.status === "DRAFT";
  const isSent = letter.status === "SENT";
  const isTerminal = letter.status === "SIGNED" || letter.status === "VOIDED";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const shareUrl = letter.shareToken ? `${baseUrl}/sign/${letter.shareToken}` : null;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
        <Link
          href={`/${params.tenant}/practice/letters`}
          className="hover:underline"
        >
          Letters
        </Link>
        <span>/</span>
        <span className="truncate text-slate-700">{letter.subject}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{letter.subject}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {letter.engagement.entity.name} ·{" "}
            <Link
              href={`/${params.tenant}/practice/engagements/${letter.engagement.id}`}
              className="hover:underline"
            >
              {letter.engagement.name}
            </Link>
          </p>
        </div>
        <span
          className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${
            STATUS_BADGE[letter.status] ?? "bg-slate-100"
          }`}
        >
          {letter.status}
        </span>
      </div>

      {/* Meta strip */}
      <div className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 md:grid-cols-4">
        <div>
          <p className="font-semibold text-slate-500">Signer</p>
          <p className="text-slate-800">{letter.signerName ?? "—"}</p>
          <p>{letter.signerEmail ?? ""}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-500">Sent</p>
          <p className="text-slate-800">{fmtDate(letter.sentAt)}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-500">Signed</p>
          <p className="text-slate-800">{fmtDate(letter.signedAt)}</p>
        </div>
        <div>
          <p className="font-semibold text-slate-500">Fee</p>
          <p className="text-slate-800">{letter.feeText ?? "—"}</p>
        </div>
      </div>

      {/* Edit / Send / Void controls */}
      {isDraft && (
        <form
          action={updateLetterDraftAction}
          className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <input type="hidden" name="tenantSlug" value={params.tenant} />
          <input type="hidden" name="id" value={letter.id} />

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Subject</span>
            <input
              name="subject"
              defaultValue={letter.subject}
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">
              Body (Markdown)
            </span>
            <textarea
              name="bodyMarkdown"
              defaultValue={letter.bodyMarkdown}
              required
              rows={16}
              className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 font-mono text-xs shadow-sm"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Fee text</span>
              <input
                name="feeText"
                defaultValue={letter.feeText ?? ""}
                maxLength={200}
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Signer name
              </span>
              <input
                name="signerName"
                defaultValue={letter.signerName ?? ""}
                maxLength={120}
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-700">
                Signer email *
              </span>
              <input
                name="signerEmail"
                type="email"
                defaultValue={letter.signerEmail ?? ""}
                maxLength={200}
                className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Save draft
            </button>
          </div>
        </form>
      )}

      {!isDraft && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Letter body
          </p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-800">
            {letter.bodyMarkdown}
          </pre>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {isDraft && (
          <form action={sendLetterAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={letter.id} />
            <button
              type="submit"
              className="rounded-md bg-lime-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-lime-300"
            >
              Send to client
            </button>
          </form>
        )}

        {!isTerminal && (
          <form action={voidLetterAction}>
            <input type="hidden" name="tenantSlug" value={params.tenant} />
            <input type="hidden" name="id" value={letter.id} />
            <input
              type="hidden"
              name="reason"
              value="Voided by tenant user"
            />
            <button
              type="submit"
              className="rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Void
            </button>
          </form>
        )}

        {(isSent || letter.status === "SIGNED") && shareUrl && (
          <div className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span className="font-semibold">Sign link:</span>{" "}
            <a
              href={shareUrl}
              className="text-sky-600 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              {shareUrl}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
