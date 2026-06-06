/*
 * Telephony settings (Sprint 7). Three tabs: Numbers (list / buy / release /
 * assign), Routing (per-number voice + SMS rules), and Configuration (Twilio
 * status + env var checklist). Works in "not configured" mode - buy/search are
 * disabled with a banner, but existing numbers and rules still render.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { isConfigured, TWILIO_ENV_VARS } from "@/lib/telephony/twilio";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import {
  listPhoneNumbers,
  listMembers,
  listRules,
  type PhoneNumberRow,
  type MemberOption,
  type RoutingRule,
} from "./actions";
import { TelephonyClient } from "./TelephonyClient";

export const dynamic = "force-dynamic";

export default async function TelephonySettingsPage() {
  try {
    getTenantDb();
    const [numbers, members, rules]: [PhoneNumberRow[], MemberOption[], RoutingRule[]] = await Promise.all([
      listPhoneNumbers(),
      listMembers(),
      listRules(),
    ]);

    const envStatus = TWILIO_ENV_VARS.map((name) => ({ name, set: Boolean(process.env[name]) }));

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <TelephonyClient
          numbers={numbers}
          members={members}
          rules={rules}
          configured={isConfigured()}
          envStatus={envStatus}
        />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
