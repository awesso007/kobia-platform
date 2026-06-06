"use client";

/*
 * Reports landing client. Renders the three built-in reports as charts
 * (Recharts) with an accompanying table, plus a grid of saved custom reports
 * that deep-link into the builder. A "New report" button opens the builder
 * fresh.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus, Trash2, BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KbButton } from "@/components/crm/ui";
import { formatCurrency } from "@/lib/utils";
import type { FunnelRow, VelocityRow, LeaderboardRow, SavedReportRow } from "./queries";
import { deleteReport } from "./actions";

const CHART_COLORS = ["#1d77bd", "#2fc6f6", "#5cb85c", "#7d4aea", "#f0ad4e", "#d9534f"];

export function ReportsClient({
  funnel,
  velocity,
  leaderboard,
  saved,
}: {
  funnel: FunnelRow[];
  velocity: VelocityRow[];
  leaderboard: LeaderboardRow[];
  saved: SavedReportRow[];
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Reports</div>
          <h1 style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Reports</h1>
        </div>
        <Link href="/app/reports/builder"><KbButton><Plus size={16} /> New report</KbButton></Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Pipeline Funnel" subtitle="Deals and value by stage">
          {funnel.length === 0 ? <Empty /> : (
            <>
              <ChartFrame>
                <BarChart data={funnel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartFrame>
              <SimpleTable
                head={["Stage", "Deals", "Value"]}
                rows={funnel.map((f) => [f.stage, String(f.count), formatCurrency(f.valueCents / 100)])}
              />
            </>
          )}
        </Card>

        <Card title="Deal Velocity" subtitle="Average days in stage">
          {velocity.length === 0 ? <Empty /> : (
            <>
              <ChartFrame>
                <BarChart data={velocity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--kb-border)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avgDays" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartFrame>
              <SimpleTable
                head={["Stage", "Avg days", "Deals"]}
                rows={velocity.map((v) => [v.stage, String(v.avgDays), String(v.deals)])}
              />
            </>
          )}
        </Card>

        <Card title="Activity Leaderboard" subtitle="Activities by owner">
          {leaderboard.length === 0 ? <Empty /> : (
            <>
              <ChartFrame>
                <PieChart>
                  <Tooltip />
                  <Pie data={leaderboard} dataKey="total" nameKey="owner" outerRadius={90} label>
                    {leaderboard.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ChartFrame>
              <SimpleTable
                head={["Owner", "Total", "Completed"]}
                rows={leaderboard.map((l) => [l.owner, String(l.total), String(l.completed)])}
              />
            </>
          )}
        </Card>

        <Card title="Saved reports" subtitle="Custom reports you have built">
          {saved.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No saved reports yet. Use New report to build one.</p>
          ) : (
            <ul className="space-y-2">
              {saved.map((r) => <SavedRow key={r.id} report={r} />)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function SavedRow({ report }: { report: SavedReportRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function remove() {
    startTransition(async () => {
      await deleteReport(report.id);
      router.refresh();
    });
  }
  return (
    <li className="flex items-center justify-between rounded px-3 py-2" style={{ border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}>
      <Link href={`/app/reports/builder?id=${report.id}`} className="flex items-center gap-2">
        <BarChart3 size={14} style={{ color: "var(--kb-text-secondary)" }} />
        <span>
          <span className="block text-sm" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{report.name}</span>
          <span className="block text-xs" style={{ color: "var(--kb-text-secondary)" }}>{report.definition.entity}</span>
        </span>
      </Link>
      <button type="button" onClick={remove} disabled={pending} aria-label="Delete report" style={{ color: "var(--kb-error)" }}><Trash2 size={14} /></button>
    </li>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="p-4" style={{ backgroundColor: "var(--kb-surface)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}>
      <div className="mb-3">
        <h2 style={{ fontSize: "var(--kb-fs-section)", fontWeight: 600, color: "var(--kb-text-primary)" }}>{title}</h2>
        {subtitle ? <p className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ChartFrame({ children }: { children: React.ReactElement }) {
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr style={{ color: "var(--kb-text-secondary)" }}>
          {head.map((h) => <th key={h} className="px-2 py-1 text-left font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderTop: "1px solid var(--kb-border)" }}>
            {r.map((c, j) => <td key={j} className="px-2 py-1" style={{ color: j === 0 ? "var(--kb-text-primary)" : "var(--kb-text-secondary)" }}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty() {
  return <p className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>No data yet.</p>;
}
