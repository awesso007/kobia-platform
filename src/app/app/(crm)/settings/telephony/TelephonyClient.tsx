"use client";

/*
 * Telephony settings UI (Sprint 7). Three tabs:
 *   1. Numbers        - list owned numbers, buy (search modal), release, assign
 *   2. Routing        - per-number voice + SMS rules (TelephonyRule CRUD)
 *   3. Configuration  - Twilio connection status + env var checklist
 *
 * Buy/search are disabled when Twilio is not configured; a banner explains why.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X, Search, Check } from "lucide-react";
import { KbButton } from "@/components/crm/ui";
import {
  searchAvailableNumbers,
  buyPhoneNumber,
  releasePhoneNumber,
  assignPhoneNumber,
  upsertRule,
  deleteRule,
  type PhoneNumberRow,
  type MemberOption,
  type RoutingRule,
} from "./actions";
import type { AvailableNumber } from "@/lib/telephony/twilio";

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  color: "var(--kb-text-primary)",
};

const TABS = ["Numbers", "Routing", "Configuration"] as const;
type Tab = (typeof TABS)[number];

export function TelephonyClient({
  numbers,
  members,
  rules,
  configured,
  envStatus,
}: {
  numbers: PhoneNumberRow[];
  members: MemberOption[];
  rules: RoutingRule[];
  configured: boolean;
  envStatus: { name: string; set: boolean }[];
}) {
  const [tab, setTab] = useState<Tab>("Numbers");

  return (
    <div>
      {!configured ? (
        <div
          className="mb-4 rounded px-3 py-2 text-sm"
          style={{ backgroundColor: "#fff7e6", border: "1px solid #f0b429", color: "#8a6116" }}
        >
          Twilio is not configured. Existing numbers and routing rules are shown, but searching and buying numbers is disabled. See the Configuration tab for required env vars.
        </div>
      ) : null}

      <div className="mb-4 flex gap-1" style={{ borderBottom: "1px solid var(--kb-border)" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="px-3 py-2 text-sm"
            style={{
              color: tab === t ? "var(--kb-primary)" : "var(--kb-text-secondary)",
              fontWeight: tab === t ? 600 : 400,
              borderBottom: tab === t ? "2px solid var(--kb-primary)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Numbers" ? <NumbersTab numbers={numbers} members={members} configured={configured} /> : null}
      {tab === "Routing" ? <RoutingTab numbers={numbers} rules={rules} /> : null}
      {tab === "Configuration" ? <ConfigurationTab configured={configured} envStatus={envStatus} /> : null}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden"
      style={{
        backgroundColor: "var(--kb-surface)",
        border: "1px solid var(--kb-border)",
        borderRadius: "var(--kb-radius)",
        boxShadow: "var(--kb-shadow-card)",
      }}
    >
      {children}
    </div>
  );
}

function memberLabel(m: MemberOption): string {
  return m.displayName || m.email || m.clerkUserId;
}

function fmtPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/mo`;
}

/* ---------------------------------- Numbers ---------------------------------- */

function NumbersTab({
  numbers,
  members,
  configured,
}: {
  numbers: PhoneNumberRow[];
  members: MemberOption[];
  configured: boolean;
}) {
  const router = useRouter();
  const [buying, setBuying] = useState(false);
  const [pending, startTransition] = useTransition();

  function onRelease(id: string) {
    if (!confirm("Release this number? It will be returned to Twilio and can no longer receive calls or SMS.")) return;
    startTransition(async () => {
      await releasePhoneNumber(id);
      router.refresh();
    });
  }

  function onAssign(id: string, clerkUserId: string) {
    startTransition(async () => {
      await assignPhoneNumber(id, clerkUserId || null);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {numbers.length} number{numbers.length === 1 ? "" : "s"}
        </div>
        <KbButton onClick={() => setBuying(true)} disabled={!configured}>
          <Plus size={15} /> Buy number
        </KbButton>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--kb-border)", color: "var(--kb-text-secondary)" }}>
              <th className="px-3 py-2 text-left font-medium">Number</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Price</th>
              <th className="px-3 py-2 text-left font-medium">Assigned to</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {numbers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center" style={{ color: "var(--kb-text-secondary)" }}>
                  No numbers yet. Buy one to start receiving calls and SMS.
                </td>
              </tr>
            ) : (
              numbers.map((n) => (
                <tr key={n.id} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{n.e164}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{n.friendlyName ?? "-"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{n.status}</td>
                  <td className="px-3 py-2" style={{ color: "var(--kb-text-secondary)" }}>{fmtPrice(n.monthlyPriceCents)}</td>
                  <td className="px-3 py-2">
                    <select
                      value={n.assignedClerkUserId ?? ""}
                      onChange={(e) => onAssign(n.id, e.target.value)}
                      disabled={n.status !== "ACTIVE" || pending}
                      className="px-2 py-1 text-sm"
                      style={inputStyle}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.clerkUserId} value={m.clerkUserId}>{memberLabel(m)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {n.status === "ACTIVE" ? (
                      <KbButton variant="ghost" onClick={() => onRelease(n.id)} disabled={pending}>
                        <Trash2 size={14} /> Release
                      </KbButton>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {buying ? <BuyModal onClose={() => setBuying(false)} /> : null}
    </div>
  );
}

function BuyModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [results, setResults] = useState<AvailableNumber[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [buyingE164, setBuyingE164] = useState<string | null>(null);
  const [buyPending, startBuy] = useTransition();

  function onSearch() {
    setError(null);
    startSearch(async () => {
      const r = await searchAvailableNumbers({ areaCode: areaCode || undefined, contains: contains || undefined });
      if (!r.ok) {
        setError(r.error ?? "Search failed.");
        setResults([]);
      } else {
        setResults(r.numbers ?? []);
      }
    });
  }

  function onBuy(e164: string) {
    setBuyingE164(e164);
    setError(null);
    startBuy(async () => {
      const r = await buyPhoneNumber(e164);
      setBuyingE164(null);
      if (!r.ok) {
        setError(r.error ?? "Purchase failed.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.35)" }} onClick={onClose}>
      <div
        className="w-full max-w-lg p-4"
        style={{ backgroundColor: "var(--kb-surface)", borderRadius: "var(--kb-radius)", boxShadow: "var(--kb-shadow-card)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>Buy a number</h2>
          <button type="button" onClick={onClose} style={{ color: "var(--kb-text-secondary)" }}><X size={18} /></button>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            placeholder="Area code (e.g. 415)"
            className="w-32 px-2 py-1 text-sm"
            style={inputStyle}
          />
          <input
            value={contains}
            onChange={(e) => setContains(e.target.value)}
            placeholder="Contains digits"
            className="flex-1 px-2 py-1 text-sm"
            style={inputStyle}
          />
          <KbButton variant="outline" onClick={onSearch} disabled={searching}>
            <Search size={14} /> {searching ? "Searching..." : "Search"}
          </KbButton>
        </div>

        {error ? (
          <div className="mb-3 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#fbeaea", border: "1px solid var(--kb-error)", color: "var(--kb-error)" }}>
            {error}
          </div>
        ) : null}

        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {results.length === 0 ? (
            <div className="px-1 py-6 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
              {searching ? "Searching..." : "Search for available numbers to buy."}
            </div>
          ) : (
            results.map((n) => (
              <div
                key={n.e164}
                className="flex items-center justify-between px-1 py-2"
                style={{ borderBottom: "1px solid var(--kb-border)" }}
              >
                <div>
                  <div style={{ color: "var(--kb-text-primary)", fontWeight: 500 }}>{n.e164}</div>
                  <div className="text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                    {[n.locality, n.region].filter(Boolean).join(", ") || n.friendlyName}
                  </div>
                </div>
                <KbButton onClick={() => onBuy(n.e164)} disabled={buyPending}>
                  {buyingE164 === n.e164 ? "Buying..." : "Buy"}
                </KbButton>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- Routing ---------------------------------- */

type VoiceConfig = { mode: "ring" | "voicemail" | "ivr"; voicemailPrompt?: string; ivrPrompt?: string };
type SmsConfig = { onInbound: "createLead" | "appendThread" };

function RoutingTab({ numbers, rules }: { numbers: PhoneNumberRow[]; rules: RoutingRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const activeNumbers = numbers.filter((n) => n.status === "ACTIVE");

  function ruleFor(phoneNumberId: string, kind: "VOICE" | "SMS"): RoutingRule | undefined {
    return rules.find((r) => r.phoneNumberId === phoneNumberId && r.kind === kind);
  }

  function saveVoice(phoneNumberId: string, existing: RoutingRule | undefined, config: VoiceConfig) {
    startTransition(async () => {
      await upsertRule({ id: existing?.id, phoneNumberId, kind: "VOICE", config: config as Record<string, unknown> });
      router.refresh();
    });
  }

  function saveSms(phoneNumberId: string, existing: RoutingRule | undefined, config: SmsConfig) {
    startTransition(async () => {
      await upsertRule({ id: existing?.id, phoneNumberId, kind: "SMS", config: config as Record<string, unknown> });
      router.refresh();
    });
  }

  function removeRule(id: string) {
    startTransition(async () => {
      await deleteRule(id);
      router.refresh();
    });
  }

  if (activeNumbers.length === 0) {
    return (
      <Card>
        <div className="px-3 py-6 text-center text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          No active numbers. Buy a number on the Numbers tab to configure routing.
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {activeNumbers.map((n) => {
        const voice = ruleFor(n.id, "VOICE");
        const sms = ruleFor(n.id, "SMS");
        const voiceCfg = (voice?.config ?? {}) as VoiceConfig;
        const smsCfg = (sms?.config ?? {}) as SmsConfig;
        const voiceMode = voiceCfg.mode ?? "ring";
        const smsMode = smsCfg.onInbound ?? "createLead";
        return (
          <Card key={n.id}>
            <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--kb-border)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
              {n.e164} {n.friendlyName ? <span style={{ fontWeight: 400, color: "var(--kb-text-secondary)" }}>({n.friendlyName})</span> : null}
            </div>
            <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2">
              {/* Voice */}
              <div>
                <div className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Incoming voice</div>
                <select
                  value={voiceMode}
                  onChange={(e) => saveVoice(n.id, voice, { ...voiceCfg, mode: e.target.value as VoiceConfig["mode"] })}
                  disabled={pending}
                  className="mb-2 w-full px-2 py-1 text-sm"
                  style={inputStyle}
                >
                  <option value="ring">Ring assigned user</option>
                  <option value="voicemail">Send to voicemail</option>
                  <option value="ivr">IVR menu</option>
                </select>
                {voiceMode === "voicemail" ? (
                  <input
                    defaultValue={voiceCfg.voicemailPrompt ?? ""}
                    onBlur={(e) => saveVoice(n.id, voice, { ...voiceCfg, mode: "voicemail", voicemailPrompt: e.target.value })}
                    placeholder="Voicemail greeting"
                    className="w-full px-2 py-1 text-sm"
                    style={inputStyle}
                  />
                ) : null}
                {voiceMode === "ivr" ? (
                  <input
                    defaultValue={voiceCfg.ivrPrompt ?? ""}
                    onBlur={(e) => saveVoice(n.id, voice, { ...voiceCfg, mode: "ivr", ivrPrompt: e.target.value })}
                    placeholder="IVR greeting (e.g. Press 1 for sales)"
                    className="w-full px-2 py-1 text-sm"
                    style={inputStyle}
                  />
                ) : null}
              </div>

              {/* SMS */}
              <div>
                <div className="mb-2 text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>Incoming SMS</div>
                <select
                  value={smsMode}
                  onChange={(e) => saveSms(n.id, sms, { onInbound: e.target.value as SmsConfig["onInbound"] })}
                  disabled={pending}
                  className="w-full px-2 py-1 text-sm"
                  style={inputStyle}
                >
                  <option value="createLead">Create a new Lead from unknown senders</option>
                  <option value="appendThread">Append to existing thread only</option>
                </select>
                {sms ? (
                  <button
                    type="button"
                    onClick={() => removeRule(sms.id)}
                    disabled={pending}
                    className="mt-2 inline-flex items-center gap-1 text-xs"
                    style={{ color: "var(--kb-text-secondary)" }}
                  >
                    <Trash2 size={12} /> Clear SMS rule
                  </button>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------- Configuration ------------------------------- */

function ConfigurationTab({
  configured,
  envStatus,
}: {
  configured: boolean;
  envStatus: { name: string; set: boolean }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center gap-2 px-3 py-3">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: configured ? "var(--kb-success, #5cb85c)" : "#d9534f" }}
          />
          <span style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>
            {configured ? "Twilio connected" : "Twilio not configured"}
          </span>
        </div>
      </Card>

      <Card>
        <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--kb-border)", fontWeight: 600, color: "var(--kb-text-primary)" }}>
          Environment variables
        </div>
        <table className="w-full text-sm">
          <tbody>
            {envStatus.map((e) => (
              <tr key={e.name} style={{ borderBottom: "1px solid var(--kb-border)" }}>
                <td className="px-3 py-2" style={{ fontFamily: "monospace", color: "var(--kb-text-primary)" }}>{e.name}</td>
                <td className="px-3 py-2 text-right">
                  {e.set ? (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--kb-success, #5cb85c)" }}>
                      <Check size={13} /> set
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
                      <X size={13} /> missing
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
          Set these in Vercel project settings. The first three are required to connect; the API key pair and app SID enable the browser calling SDK.
        </div>
      </Card>
    </div>
  );
}
