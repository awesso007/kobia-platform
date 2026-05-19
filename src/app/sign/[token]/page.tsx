import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { signLetterPublicAction } from "@/app/actions/letter-actions";

export const dynamic = "force-dynamic";

export default async function PublicSignPage({
  params,
}: {
  params: { token: string };
}) {
  const letter = await db.engagementLetter.findUnique({
    where: { shareToken: params.token },
    include: {
      engagement: { include: { entity: { select: { name: true } } } },
    },
  });
  if (!letter) notFound();

  const tenant = await db.tenant.findUnique({
    where: { id: letter.tenantId },
    select: { name: true, primaryColor: true, logoUrl: true },
  });
  const firmName = tenant?.name ?? "Your accountant";

  const alreadySigned = letter.status === "SIGNED";
  const voided = letter.status === "VOIDED";

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        {/* Firm header */}
        <div className="mb-6 flex items-center gap-3">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt={firmName}
              className="h-10 w-10 rounded-md object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-md text-sm font-semibold text-white"
              style={{ background: tenant?.primaryColor ?? "#0f172a" }}
            >
              {firmName.charAt(0)}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">{firmName}</p>
            <p className="text-xs text-slate-500">Engagement letter</p>
          </div>
        </div>

        {voided && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            This letter has been voided and is no longer available for signing.
          </div>
        )}

        {alreadySigned && (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            This letter was signed on{" "}
            {letter.signedAt
              ? new Date(letter.signedAt).toLocaleString()
              : "—"}{" "}
            by {letter.signerName ?? letter.signerEmail ?? "the signer"}.
          </div>
        )}

        {/* Letter body */}
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">
            {letter.subject}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            For {letter.engagement.entity.name} —{" "}
            {letter.engagement.type.toLowerCase()}
          </p>

          <pre className="mt-6 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800">
            {letter.bodyMarkdown}
          </pre>

          {letter.feeText && (
            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <span className="font-semibold text-slate-700">Fee:</span>{" "}
              <span className="text-slate-800">{letter.feeText}</span>
            </div>
          )}
        </div>

        {/* Sign form */}
        {!alreadySigned && !voided && (
          <form
            action={signLetterPublicAction}
            className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          >
            <input type="hidden" name="shareToken" value={params.token} />
            <h2 className="text-sm font-semibold text-slate-900">
              Sign this letter
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              By typing your name and clicking sign below, you agree to the terms
              of this engagement.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Full name *
                </span>
                <input
                  name="signerName"
                  required
                  defaultValue={letter.signerName ?? ""}
                  maxLength={120}
                  className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Email *
                </span>
                <input
                  name="signerEmail"
                  type="email"
                  required
                  defaultValue={letter.signerEmail ?? ""}
                  maxLength={200}
                  className="mt-1 block w-full rounded-md border-slate-300 px-3 py-2 text-sm shadow-sm"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                className="rounded-md bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-lime-300"
              >
                Sign letter
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
