/// Variable substitution for engagement letters.
/// All variables: {{client_name}}, {{firm_name}}, {{engagement_name}},
/// {{engagement_type}}, {{start_date}}, {{target_date}}, {{fee_text}},
/// {{today}}, {{signer_name}}, {{signer_email}}

export interface LetterContext {
  clientName: string;
  firmName: string;
  engagementName: string;
  engagementType: string;
  startDate: Date | null;
  targetDate: Date | null;
  feeText: string | null;
  signerName: string | null;
  signerEmail: string | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function substituteLetterVariables(template: string, ctx: LetterContext): string {
  const today = new Date();
  const replacements: Record<string, string> = {
    "{{client_name}}": ctx.clientName,
    "{{firm_name}}": ctx.firmName,
    "{{engagement_name}}": ctx.engagementName,
    "{{engagement_type}}": ctx.engagementType,
    "{{start_date}}": fmtDate(ctx.startDate),
    "{{target_date}}": fmtDate(ctx.targetDate),
    "{{fee_text}}": ctx.feeText ?? "",
    "{{today}}": fmtDate(today),
    "{{signer_name}}": ctx.signerName ?? "",
    "{{signer_email}}": ctx.signerEmail ?? "",
  };
  let out = template;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out;
}

export const AVAILABLE_VARIABLES: { key: string; label: string }[] = [
  { key: "{{client_name}}", label: "Client / Entity name" },
  { key: "{{firm_name}}", label: "Firm (tenant) name" },
  { key: "{{engagement_name}}", label: "Engagement name" },
  { key: "{{engagement_type}}", label: "Engagement type" },
  { key: "{{start_date}}", label: "Start date" },
  { key: "{{target_date}}", label: "Target completion date" },
  { key: "{{fee_text}}", label: "Fee description" },
  { key: "{{today}}", label: "Today's date" },
  { key: "{{signer_name}}", label: "Signer name" },
  { key: "{{signer_email}}", label: "Signer email" },
];
