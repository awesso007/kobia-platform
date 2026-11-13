import Link from "next/link";
import { listClientProfiles } from "@/lib/client-profile/service";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import CreateProfileClient from "./CreateProfileClient";

export const dynamic = "force-dynamic";

export default async function ClientProfilesPage() {
  const membership=await getCurrentMembership().catch(()=>null);
  const canManage=membership?.status==="ACTIVE"&&["OWNER","ADMIN"].includes(membership.role);
  let profiles: Awaited<ReturnType<typeof listClientProfiles>> = [];
  let error = false;
  try {
    profiles = await listClientProfiles();
  } catch {
    error = true;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">CHESS CORP 2</p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">Unified Client Profiles</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Basic relationship information only. Regulated service records remain separately permissioned.
        </p>
      </div>
      {canManage&&<CreateProfileClient/>}
      {error ? (
        <section role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
          Client profiles are unavailable or your account is not authorized.
        </section>
      ) : profiles.length === 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-8 text-slate-600">
          No assigned client profiles to display.
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr>
              <th scope="col" className="p-4">Client</th>
              <th scope="col" className="p-4">CRM contact</th>
              <th scope="col" className="p-4">Last updated</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.map(profile => (
                <tr key={profile.id}>
                  <td className="p-4 font-medium text-slate-900">
                    {canManage?<Link href={`/app/client-profiles/${encodeURIComponent(profile.id)}`}
                     className="text-emerald-800 underline-offset-4 hover:underline focus-visible:underline">
                     {profile.displayName}
                    </Link>:profile.displayName}
                  </td>
                  <td className="p-4 text-slate-600">{profile.contactId || "Not linked"}</td>
                  <td className="p-4 text-slate-600">{profile.updatedAt.toISOString().slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        This workspace is in development. Access approvals, audit logging and production security review are pending.
      </p>
      <Link href="/app/overview" className="inline-block text-sm font-medium text-emerald-700 hover:underline">
        Return to operations overview
      </Link>
    </main>
  );
}
