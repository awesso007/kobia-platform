"use client";

/*
 * Campaign builder (Sprint 13). Edits a campaign's name, trigger, segment, and
 * an ordered list of steps (EMAIL / SMS / WAIT / CONDITION / TAG / WEBHOOK).
 * Used for both create and edit. The Activate button enrolls the segment's
 * current members and flips the campaign to ACTIVE.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCampaign, updateCampaign, deleteCampaign, activateCampaignAction, setCampaignStatusAction } from "../actions";
import { PageHeader, Card, MarketingBadge } from "../MarketingUI";

type SegmentLite = { id: string; name: string; entityType: string };
type StepType = "EMAIL" | "SMS" | "WAIT" | "CONDITION" | "TAG" | "WEBHOOK";
type Step = { type: StepType; config: Record<string, unknown> };

const STEP_TYPES: StepType[] = ["EMAIL", "SMS", "WAIT", "CONDITION", "TAG", "WEBHOOK"];

export function CampaignBuilder({
  campaign,
  segments,
}: {
  campaign?: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    triggerType: string;
    segmentId: string | null;
    steps: { type: string; config: unknown }[];
  };
  segments: SegmentLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState(campaign?.name ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [triggerType, setTriggerType] = useState<"MANUAL" | "SEGMENT_ENTRY" | "TAG_ADDED" | "FORM_SUBMITTED">(
    (campaign?.triggerType as "MANUAL") ?? "MANUAL",
  );
  const [segmentId, setSegmentId] = useState(campaign?.segmentId ?? "");
  const [steps, setSteps] = useState<Step[]>(
    campaign?.steps.map((s) => ({ type: s.type as StepType, config: (s.config ?? {}) as Record<string, unknown> })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function addStep(type: StepType) {
    setSteps((s) => [...s, { type, config: {} }]);
  }
  function setStepConfig(i: number, patch: Record<string, unknown>) {
    setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, config: { ...step.config, ...patch } } : step)));
  }
  function removeStep(i: number) {
    setSteps((s) => s.filter((_, idx) => idx !== i));
  }
  function moveStep(i: number, dir: -1 | 1) {
    setSteps((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      const a = copy[i];
      const b = copy[j];
      if (!a || !b) return s;
      copy[i] = b;
      copy[j] = a;
      return copy;
    });
  }

  function payload() {
    return { name, description, triggerType, triggerConfigJson: {}, segmentId: segmentId || null, steps };
  }

  function save() {
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        if (campaign) {
          await updateCampaign(campaign.id, payload());
          setInfo("Saved.");
          router.refresh();
        } else {
          const id = await createCampaign(payload());
          router.push(`/app/marketing/campaigns/${id}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save campaign.");
      }
    });
  }

  function activate() {
    if (!campaign) return;
    setError(null);
    setInfo(null);
    start(async () => {
      try {
        await updateCampaign(campaign.id, payload());
        const res = await activateCampaignAction(campaign.id);
        setInfo(`Activated. ${res.enrolled} new enrollment(s).`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not activate campaign.");
      }
    });
  }

  function setStatus(status: "PAUSED" | "ACTIVE" | "ARCHIVED") {
    if (!campaign) return;
    start(async () => {
      await setCampaignStatusAction(campaign.id, status);
      router.refresh();
    });
  }

  function remove() {
    if (!campaign) return;
    if (!confirm("Delete this campaign?")) return;
    start(async () => {
      await deleteCampaign(campaign.id);
      router.push("/app/marketing/campaigns");
    });
  }

  return (
    <div className="p-6">
      <PageHeader
        title={campaign ? "Campaign" : "New campaign"}
        subtitle="Steps run top to bottom for each enrollee."
        action={
          <div className="flex items-center gap-2">
            {campaign ? <MarketingBadge value={campaign.status} /> : null}
            {campaign ? (
              <button
                onClick={remove}
                disabled={pending}
                className="rounded px-3 py-1.5 text-sm font-medium"
                style={{ color: "var(--kb-error)", border: "1px solid var(--kb-border)", borderRadius: "var(--kb-radius-sm)" }}
              >
                Delete
              </button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#d9534f1a", color: "var(--kb-error)" }}>
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mb-4 rounded px-3 py-2 text-sm" style={{ backgroundColor: "#5cb85c1a", color: "var(--kb-success)" }}>
          {info}
        </div>
      ) : null}

      <Card className="p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="New lead drip" />
          </Field>
          <Field label="Trigger">
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as "MANUAL")} style={inputStyle}>
              <option value="MANUAL">Manual</option>
              <option value="SEGMENT_ENTRY">Segment entry</option>
              <option value="TAG_ADDED">Tag added</option>
              <option value="FORM_SUBMITTED">Form submitted</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} placeholder="Optional" />
        </Field>
        <Field label="Audience segment">
          <select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} style={inputStyle}>
            <option value="">No segment (manual enrollment)</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.entityType})
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <div className="mt-5">
        <h2 className="mb-2 text-sm font-semibold" style={{ color: "var(--kb-text-primary)" }}>
          Steps
        </h2>
        <div className="space-y-3">
          {steps.map((step, i) => (
            <Card key={i} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "var(--kb-text-primary)" }}>
                  {i + 1}. {step.type}
                </span>
                <div className="flex items-center gap-1 text-xs">
                  <button onClick={() => moveStep(i, -1)} style={{ color: "var(--kb-text-secondary)" }}>
                    Up
                  </button>
                  <button onClick={() => moveStep(i, 1)} style={{ color: "var(--kb-text-secondary)" }}>
                    Down
                  </button>
                  <button onClick={() => removeStep(i)} style={{ color: "var(--kb-error)" }}>
                    Remove
                  </button>
                </div>
              </div>
              <StepConfig step={step} onChange={(patch) => setStepConfig(i, patch)} />
            </Card>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {STEP_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => addStep(t)}
              className="rounded px-3 py-1 text-xs font-medium"
              style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
            >
              + {t}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-medium"
          style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
        >
          {campaign ? "Save" : "Create campaign"}
        </button>
        {campaign && campaign.status !== "ACTIVE" ? (
          <button
            onClick={activate}
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--kb-primary)", borderRadius: "var(--kb-radius-sm)" }}
          >
            Activate
          </button>
        ) : null}
        {campaign && campaign.status === "ACTIVE" ? (
          <button
            onClick={() => setStatus("PAUSED")}
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ border: "1px solid var(--kb-border)", color: "var(--kb-text-primary)", borderRadius: "var(--kb-radius-sm)" }}
          >
            Pause
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StepConfig({ step, onChange }: { step: Step; onChange: (patch: Record<string, unknown>) => void }) {
  const cfg = step.config;
  const str = (k: string) => String(cfg[k] ?? "");
  if (step.type === "EMAIL") {
    return (
      <div className="space-y-2">
        <input value={str("subject")} onChange={(e) => onChange({ subject: e.target.value })} style={inputStyle} placeholder="Subject" />
        <textarea value={str("body")} onChange={(e) => onChange({ body: e.target.value })} style={{ ...inputStyle, minHeight: 90 }} placeholder="HTML body" />
      </div>
    );
  }
  if (step.type === "SMS") {
    return <textarea value={str("body")} onChange={(e) => onChange({ body: e.target.value })} style={{ ...inputStyle, minHeight: 70 }} placeholder="Message" />;
  }
  if (step.type === "WAIT") {
    return (
      <div className="flex gap-2">
        <input type="number" min={0} value={str("days")} onChange={(e) => onChange({ days: Number(e.target.value) })} style={{ ...inputStyle, width: 120 }} placeholder="Days" />
        <input type="number" min={0} value={str("hours")} onChange={(e) => onChange({ hours: Number(e.target.value) })} style={{ ...inputStyle, width: 120 }} placeholder="Hours" />
      </div>
    );
  }
  if (step.type === "CONDITION") {
    return (
      <div className="flex gap-2">
        <input value={str("field")} onChange={(e) => onChange({ field: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="Field" />
        <input value={str("op")} onChange={(e) => onChange({ op: e.target.value })} style={{ ...inputStyle, width: 120 }} placeholder="op (eq)" />
        <input value={str("value")} onChange={(e) => onChange({ value: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="Value" />
      </div>
    );
  }
  if (step.type === "TAG") {
    return <input value={str("tagId")} onChange={(e) => onChange({ tagId: e.target.value })} style={inputStyle} placeholder="Tag id" />;
  }
  if (step.type === "WEBHOOK") {
    return <input value={str("url")} onChange={(e) => onChange({ url: e.target.value })} style={inputStyle} placeholder="https://..." />;
  }
  return null;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: "14px",
  border: "1px solid var(--kb-border)",
  borderRadius: "var(--kb-radius-sm)",
  backgroundColor: "var(--kb-surface)",
  color: "var(--kb-text-primary)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--kb-text-secondary)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
