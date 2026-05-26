/**
 * Clerk catch-all login route. The <SignIn> widget internally navigates to
 * /factor-one, /verify, etc. — this file makes those sub-paths resolve.
 */
import { SignIn } from "@clerk/nextjs";
import { getTenantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TenantLoginCatchAll({
  params,
}: {
  params: { tenant: string };
}) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logoUrl}
              alt={`${tenant.name} logo`}
              className="mx-auto h-16 w-auto"
            />
          ) : (
            <div className="mx-auto flex h-16 items-center justify-center rounded-lg bg-slate-900 px-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-64.png" alt="KOBIA" className="h-10 w-auto" />
            </div>
          )}
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
        </div>
        <SignIn
          path={`/${tenant.slug}/login`}
          routing="path"
          signUpUrl={`/signup`}
          appearance={{
            elements: {
              rootBox: "mx-auto",
              card: "shadow-sm",
            },
          }}
          forceRedirectUrl={`/${tenant.slug}/dashboard`}
        />
      </div>
    </div>
  );
}
