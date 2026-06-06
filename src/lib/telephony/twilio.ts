/*
 * Twilio wrapper (Sprint 7). Lazily loads the twilio SDK so the app builds and
 * runs without the dependency configured. All credential reads come from env;
 * isConfigured() gates every page and action. When unconfigured, every method
 * throws TwilioNotConfiguredError, which callers catch to render a graceful
 * "not configured" notice.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN   (core - required)
 *   TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_APP_SID  (browser SDK)
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { Twilio } from "twilio";

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super(
      "Twilio not configured - set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_APP_SID in Vercel env.",
    );
    this.name = "TwilioNotConfiguredError";
  }
}

/** True when the three core credentials are present. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_API_KEY_SID,
  );
}

/** The list of env var names this integration reads (for the config banner). */
export const TWILIO_ENV_VARS = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_APP_SID",
] as const;

let cached: Twilio | null = null;

async function client(): Promise<Twilio> {
  if (!isConfigured()) throw new TwilioNotConfiguredError();
  if (cached) return cached;
  // Lazy import so the SDK is only loaded when actually used.
  const twilio = (await import("twilio")).default;
  cached = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  return cached;
}

function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export type NumberCapabilities = { voice: boolean; sms: boolean; mms: boolean };

export type AvailableNumber = {
  e164: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
  capabilities: NumberCapabilities;
};

export type SearchNumbersInput = {
  areaCode?: string;
  contains?: string;
  capabilities?: Partial<NumberCapabilities>;
  country?: string;
  limit?: number;
};

/** Search Twilio's inventory for purchasable local numbers. */
export async function searchNumbers(input: SearchNumbersInput): Promise<AvailableNumber[]> {
  const c = await client();
  const country = input.country ?? "US";
  const opts: Record<string, unknown> = { limit: input.limit ?? 20 };
  if (input.areaCode) opts.areaCode = Number(input.areaCode);
  if (input.contains) opts.contains = input.contains;
  if (input.capabilities?.sms) opts.smsEnabled = true;
  if (input.capabilities?.voice) opts.voiceEnabled = true;
  if (input.capabilities?.mms) opts.mmsEnabled = true;

  const list = await c.availablePhoneNumbers(country).local.list(opts as never);
  return list.map((n) => ({
    e164: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality ?? null,
    region: n.region ?? null,
    capabilities: {
      voice: Boolean(n.capabilities?.voice),
      sms: Boolean(n.capabilities?.sms),
      mms: Boolean(n.capabilities?.mms),
    },
  }));
}

export type PurchasedNumber = {
  sid: string;
  e164: string;
  capabilities: NumberCapabilities;
};

/** Buy a number and point its voice + SMS webhooks at this app. */
export async function buyNumber(e164: string): Promise<PurchasedNumber> {
  const c = await client();
  const base = appBaseUrl();
  const bought = await c.incomingPhoneNumbers.create({
    phoneNumber: e164,
    voiceUrl: `${base}/api/webhooks/twilio/voice/incoming`,
    voiceMethod: "POST",
    statusCallback: `${base}/api/webhooks/twilio/voice/status`,
    statusCallbackMethod: "POST",
    smsUrl: `${base}/api/webhooks/twilio/sms`,
    smsMethod: "POST",
  });
  return {
    sid: bought.sid,
    e164: bought.phoneNumber,
    capabilities: {
      voice: Boolean(bought.capabilities?.voice),
      sms: Boolean(bought.capabilities?.sms),
      mms: Boolean(bought.capabilities?.mms),
    },
  };
}

/** Release a number back to Twilio by its incoming-phone-number SID. */
export async function releaseNumber(sid: string): Promise<void> {
  const c = await client();
  await c.incomingPhoneNumbers(sid).remove();
}

export type SendSmsInput = { from: string; to: string; body: string; mediaUrls?: string[] };

export async function sendSms(input: SendSmsInput): Promise<{ sid: string; status: string }> {
  const c = await client();
  const msg = await c.messages.create({
    from: input.from,
    to: input.to,
    body: input.body,
    ...(input.mediaUrls && input.mediaUrls.length > 0 ? { mediaUrl: input.mediaUrls } : {}),
    statusCallback: `${appBaseUrl()}/api/webhooks/twilio/sms/status`,
  });
  return { sid: msg.sid, status: msg.status };
}

export type OutboundCallInput = { from: string; to: string; recordingEnabled?: boolean };

/**
 * Place an outbound call. The call dials `to`; TwiML served at the dial webhook
 * bridges the two legs. recordingEnabled turns on dual-channel recording.
 */
export async function createOutboundCall(input: OutboundCallInput): Promise<{ sid: string; status: string }> {
  const c = await client();
  const base = appBaseUrl();
  const call = await c.calls.create({
    from: input.from,
    to: input.to,
    url: `${base}/api/webhooks/twilio/voice/incoming`,
    statusCallback: `${base}/api/webhooks/twilio/voice/status`,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    ...(input.recordingEnabled ? { record: true, recordingStatusCallback: `${base}/api/webhooks/twilio/voice/recording` } : {}),
  });
  return { sid: call.sid, status: call.status };
}

export type TwiMLDialOptions = {
  /** Number to bridge to (the human leg). */
  dialNumber?: string;
  /** Twilio Client identity to dial (browser SDK). */
  dialClient?: string;
  callerId?: string;
  recordingEnabled?: boolean;
  /** When set, falls back to voicemail prompt + record instead of dialing. */
  voicemailPrompt?: string;
};

/**
 * Build a TwiML document string. Pure - does not touch the SDK, so it is safe
 * to call without Twilio configured (webhooks need it to respond).
 */
export function generateTwiML(opts: TwiMLDialOptions): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const parts: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<Response>"];
  if (opts.voicemailPrompt) {
    parts.push(`<Say>${esc(opts.voicemailPrompt)}</Say>`);
    parts.push(`<Record maxLength="120" playBeep="true" recordingStatusCallback="/api/webhooks/twilio/voice/recording" />`);
  } else {
    const dialAttrs: string[] = [];
    if (opts.callerId) dialAttrs.push(`callerId="${esc(opts.callerId)}"`);
    if (opts.recordingEnabled) dialAttrs.push(`record="record-from-answer"`);
    parts.push(`<Dial ${dialAttrs.join(" ")}>`);
    if (opts.dialClient) parts.push(`<Client>${esc(opts.dialClient)}</Client>`);
    else if (opts.dialNumber) parts.push(`<Number>${esc(opts.dialNumber)}</Number>`);
    parts.push("</Dial>");
  }
  parts.push("</Response>");
  return parts.join("");
}

/** Mint a Voice access token for the browser SDK, scoped to a clerk user id. */
export async function generateAccessToken(clerkUserId: string): Promise<string> {
  if (!isConfigured()) throw new TwilioNotConfiguredError();
  if (!process.env.TWILIO_API_KEY_SECRET || !process.env.TWILIO_APP_SID) {
    throw new TwilioNotConfiguredError();
  }
  const twilio = await import("twilio");
  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { identity: clerkUserId },
  );
  token.addGrant(new VoiceGrant({ outgoingApplicationSid: process.env.TWILIO_APP_SID!, incomingAllow: true }));
  return token.toJwt();
}

/** Validate an inbound Twilio webhook signature against the raw form params. */
export async function validateSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signature) return false;
  const twilio = await import("twilio");
  return twilio.validateRequest(authToken, signature, url, params);
}
