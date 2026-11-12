import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";
import { CHESS_DEMO_SLUG,chessDemoModeActive } from "@/lib/chess/demo-mode";
import {
  ensureChessDemoEmployeeMembership,
  ensureChessDemoOwnerMembership,
} from "@/lib/chess/demo-owner";

export const dynamic = "force-dynamic";

type Metric = { title: string; value: number; description: string; href: string };
type Shortcut = { title: string; description: string; href: string };

const shortcuts: Shortcut[] = [
  { title: "CHESS service desk", description: "Employee and manager CHESS workflows", href: "/app/chess-desk" },
  { title: "Contacts", description: "People and client relationships", href: "/app/contacts" },
  { title: "Companies", description: "Client and prospect organizations", href: "/app/companies" },
  { title: "Leads", description: "New inquiries and follow-up", href: "/app/leads" },
  { title: "Deals", description: "Opportunity pipeline", href: "/app/deals" },
  { title: "Tasks", description: "Your assignments and due dates", href: "/app/tasks" },
  { title: "Projects", description: "Coordinate team work", href: "/app/projects" },
  { title: "Documents", description: "Organize working documents", href: "/app/documents" },
  { title: "Calendar", description: "Appointments and scheduled work", href: "/app/calendar" },
  { title: "CHESS work items", description: "Assigned work and calendar consent", href: "/app/work-items" },
  { title: "Finance operations", description: "Approved accounting, payroll and tax service cases", href: "/app/finance-operations" },
  { title: "Security assurance", description: "Audit-archive and worker exceptions (owner/admin)", href: "/app/security-operations" },
  { title: "Service billing", description: "Invoice approval and merchant observations", href: "/app/service-billing" },
];

function ShortcutCard({ title, description, href }: Shortcut) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-400 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="text-sm font-semibold text-slate-900">{title} <span aria-hidden="true">→</span></div>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </Link>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <section className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-6" role="status">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
    </section>
  );
}

export default async function OperationsOverviewPage() {
  // Fail closed. This page must not use the permissive legacy CRM action fallback.
  const clerkUserId = auth().userId;
  if (!clerkUserId) {
    return <StateMessage title="Sign-in required" description="Please sign in to view your workspace." />;
  }

  try {
    await ensureChessDemoOwnerMembership();
    await ensureChessDemoEmployeeMembership();
    // getTenantDb resolves only the selected tenant schema from middleware.
    const { db,tenantId } = getTenantDb();
    const member = await db.membership.findUnique({
      where: { clerkUserId },
      select: { role: true, status: true },
    });

    if (!member || member.status !== "ACTIVE") {
      return <StateMessage title="Workspace access unavailable" description="An active membership is required to open this workspace." />;
    }

    const isManager = member.role === "OWNER" || member.role === "ADMIN";

    // Staff can navigate to their permitted work but never receive tenant-wide metrics.
    if (!isManager) {
      return (
        <div className="mx-auto max-w-6xl space-y-6">
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">KOBIA workspace</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">My work</h1>
            <p className="mt-2 text-sm text-slate-600">Open your assigned work in the current company workspace.</p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.filter((item) => ["Tasks", "Calendar", "Projects", "CHESS work items", "CHESS service desk"].includes(item.title)).map((item) => <ShortcutCard key={item.href} {...item} />)}
          </div>
        </div>
      );
    }

    const [contacts, companies, leads, deals, projects, tasks, team] = await Promise.all([
      db.contact.count(),
      db.company.count(),
      db.lead.count({ where: { status: { in: ["NEW", "CONTACTED"] } } }),
      db.deal.count({ where: { status: "OPEN" } }),
      db.project.count({ where: { status: "ACTIVE" } }),
      db.task.count({ where: { deletedAt: null, status: { notIn: ["DONE", "CANCELED"] } } }),
      db.membership.count({ where: { status: "ACTIVE" } }),
    ]);

    const metrics: Metric[] = [
      { title: "Contacts", value: contacts, description: "People in this workspace", href: "/app/contacts" },
      { title: "CRM companies", value: companies, description: "Client and prospect organizations", href: "/app/companies" },
      { title: "Leads to follow up", value: leads, description: "New or contacted leads", href: "/app/leads" },
      { title: "Open deals", value: deals, description: "Active sales opportunities", href: "/app/deals" },
      { title: "Active projects", value: projects, description: "Projects in progress", href: "/app/projects" },
      { title: "Open tasks", value: tasks, description: "Not completed or canceled", href: "/app/tasks" },
      { title: "Active team members", value: team, description: "Workspace memberships, not payroll headcount", href: "/app/settings/team" },
    ];

    return (
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">KOBIA / Operations</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Workspace overview</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              One place to start work with your clients, team, projects, and documents.
              Figures below are from the currently selected workspace only.
            </p>
          </div>
          <Link href="/app/settings/team" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Manage team
          </Link>
        </header>

        {tenantId===CHESS_DEMO_SLUG && chessDemoModeActive() && <section aria-label="CHESS fictional demo" className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
          <h2 className="font-semibold text-emerald-950">CHESS Corporation - FICTIONAL DEMO</h2>
          <p className="mt-1 text-sm text-emerald-900">
            All people, clients and businesses in this sandbox are invented.
            Client consent, provider approvals, payroll, payments, tax filing and regulated execution
            remain disabled or subject to their normal authorization gates.
          </p>
          <nav aria-label="Explore CHESS demo workflows" className="mt-3 flex flex-wrap gap-3 text-sm font-semibold text-emerald-950">
            <Link href="/app/demo" className="underline">Guided demo tour</Link>
            <Link href="/app/business-units" className="underline">Business units and staff</Link>
            <Link href="/app/client-profiles" className="underline">Client profiles</Link>
            <Link href="/app/work-items" className="underline">Work items</Link>
            <Link href="/app/finance-operations" className="underline">Finance workflows</Link>
            <Link href="/app/regulated-services" className="underline">Regulated coordination</Link>
            <Link href="/app/operations-reports" className="underline">Operational reports</Link>
          </nav>
        </section>}
        <section aria-labelledby="snapshot-heading">
          <h2 id="snapshot-heading" className="mb-3 text-lg font-semibold text-slate-900">Live workspace snapshot</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <Link key={metric.title} href={metric.href} className="rounded-xl border border-slate-200 bg-white p-5 transition hover:shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.title}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">{metric.value.toLocaleString("en-US")}</p>
                <p className="mt-1 text-xs text-slate-500">{metric.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section aria-labelledby="work-heading">
          <h2 id="work-heading" className="mb-3 text-lg font-semibold text-slate-900">Go to work</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((item) => <ShortcutCard key={item.href} {...item} />)}
          </div>
        </section>

        <section aria-labelledby="scope-heading" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 id="scope-heading" className="text-sm font-semibold text-amber-950">What this overview does and does not do</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            This dashboard reads existing CRM and work-management records within one KOBIA tenant.
            It does not combine separate Chess company databases, expose regulated service workflows,
            or create a universal cross-company client record. Those features require explicit data-sharing permissions,
            identity matching, and compliance review before being enabled.
          </p>
        </section>
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
