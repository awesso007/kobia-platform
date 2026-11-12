import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import {
  CHESS_DEMO_SCHEMA,
  CHESS_DEMO_SLUG,
  chessDemoModeActive,
} from "@/lib/chess/demo-mode";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CHESS fictional client preview",
  robots: { index: false, follow: false },
};

/**
 * Read-only client-facing preview for one verified, allowlisted Clerk TEST
 * identity. It exposes only that identity's fictional profile and PENDING
 * demo disclosures. It never accepts consent or exposes service records.
 */
export default async function ChessDemoClientPreview() {
  if (!chessDemoModeActive()) notFound();

  const { db, tenantId, schemaName } = getTenantDb();
  if (tenantId !== CHESS_DEMO_SLUG || schemaName !== CHESS_DEMO_SCHEMA) notFound();

  const clerkUserId = auth().userId;
  if (!clerkUserId) notFound();
  const user = await currentUser();
  const primary = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );
  const email = primary?.emailAddress?.trim().toLowerCase();
  const allowedEmail = process.env.CHESS_DEMO_CLIENT_EMAIL?.trim().toLowerCase();
  if (!email || user?.id !== clerkUserId ||
      primary?.verification?.status !== "verified" ||
      !allowedEmail || email !== allowedEmail) notFound();

  const contact = await db.contact.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!contact) notFound();

  const profile = await db.clientProfile.findFirst({
    where: {
      contactId: contact.id,
      displayName: { endsWith: "(FICTIONAL)" },
    },
    select: { id: true, displayName: true },
  });
  if (!profile) notFound();

  const links = await db.clientServiceLink.findMany({
    where: { profileId: profile.id },
    select: { id: true },
  });
  const grantCount = await db.clientServiceGrant.count({
    where: { linkId: { in: links.map((link) => link.id) } },
  });
  if (grantCount !== 0) notFound();

  const disclosures = await db.chessClientConsent.findMany({
    where: {
      clientProfileId: profile.id,
      policyVersion: "fictional-demo-v1",
      status: "PENDING",
    },
    select: {
      purpose: true,
      policyVersion: true,
      policyText: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return (
    <main className="mx-auto max-w-3xl space-y-7 px-6 py-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
          CHESS Corporation · FICTIONAL CLIENT PREVIEW
        </p>
        <h1 className="text-3xl font-semibold text-slate-950">
          Your CHESS client preview
        </h1>
        <p className="text-sm leading-6 text-slate-700">
          Welcome, {profile.displayName}. This read-only page contains only
          fictional demo information matched to your verified Clerk test email.
        </p>
      </header>

      <section aria-labelledby="demo-disclosures" className="space-y-4">
        <h2 id="demo-disclosures" className="text-xl font-semibold text-slate-900">
          Sample disclosures
        </h2>
        {disclosures.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-700">
            No pending fictional disclosures are available for this test profile.
          </p>
        ) : (
          <ul className="space-y-3">
            {disclosures.map((disclosure, index) => (
              <li
                key={disclosure.purpose + disclosure.policyVersion + index}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold text-slate-900">
                    {disclosure.purpose}
                  </h3>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                    {disclosure.status}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Policy version {disclosure.policyVersion}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {disclosure.policyText}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-label="Read-only demo limitations"
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
      >
        <h2 className="font-semibold text-emerald-950">
          This preview cannot accept or withdraw consent
        </h2>
        <p className="mt-2 text-sm leading-6 text-emerald-900">
          These disclosures are fictional and remain PENDING. No service grant
          exists. No employee can access your service records from this page.
          Real client onboarding, legally required signatures and consent
          decisions remain disabled in the demo.
        </p>
      </section>
    </main>
  );
}
