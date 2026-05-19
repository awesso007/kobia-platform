import { SignIn } from "@clerk/nextjs";
import { getTenantBySlug } from "@/lib/tenant";
import { notFound } from "next/navigation";

export default async function TenantLoginPage({ params }: { params: { tenant: string } }) {
  const tenant = await getTenantBySlug(params.tenant);
  if (!tenant) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          {tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={`${tenant.name} logo`}
              className="mx-auto h-16 w-auto"
            />
          ) : (
            <h1 className="text-3xl font-bold">{tenant.name}</h1>
          )}
          <p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
        </div>
        <SignIn
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
