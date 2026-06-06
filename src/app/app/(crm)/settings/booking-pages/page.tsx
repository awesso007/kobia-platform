/*
 * Booking pages settings (Sprint 12). Lists BookingPage rows with a create form
 * and an inline editor that includes the weekly availability grid. The public
 * scheduling surface lives at /book/[slug].
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { headers } from "next/headers";
import { listBookingPages } from "@/lib/calendar/queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { BookingPagesManager } from "./BookingPagesManager";

export const dynamic = "force-dynamic";

export default async function BookingPagesPage() {
  try {
    const pages = await listBookingPages();
    const host = headers().get("host") ?? "kobia.ai";
    const proto = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${proto}://${host}`;

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <BookingPagesManager pages={pages} baseUrl={baseUrl} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
