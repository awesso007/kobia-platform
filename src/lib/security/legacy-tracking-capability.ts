/**
 * Public legacy email tracking capabilities. A recipient ID and a tenant
 * query are not permission to edit delivery state or use our domain as
 * an arbitrary redirector. All writes/redirects require a signed, expiring,
 * purpose-bound capability minted by a trusted server.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type LegacyTrackingPurpose = "OPEN" | "CLICK";
export type LegacyTrackingCapability = {
  v: 1;
  p: LegacyTrackingPurpose;
  t: string;
  r: string;
  exp: number;
  url?: string;
};
const MAX_TTL_SECONDS = 30 * 24 * 3600;

function safeSlug(value: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value);
}
function safeRecipient(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
function safeRedirect(value: string | undefined): boolean {
  if (!value || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      Boolean(u.hostname) && !u.username && !u.password;
  } catch { return false; }
}
function signingKey(key: string | undefined): string | null {
  return key && Buffer.byteLength(key, "utf8") >= 32 ? key : null;
}

export function issueLegacyTrackingCapability(
  input: Omit<LegacyTrackingCapability, "v" | "exp"> & { ttlSeconds?: number },
  key: string | undefined = process.env.KOBIA_TRACKING_SIGNING_KEY,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  const secret = signingKey(key);
  const ttl = input.ttlSeconds ?? MAX_TTL_SECONDS;
  if (!secret || !safeSlug(input.t) || !safeRecipient(input.r) ||
      !Number.isSafeInteger(ttl) || ttl < 1 || ttl > MAX_TTL_SECONDS ||
      (input.p === "OPEN" ? input.url !== undefined : input.p === "CLICK" ? !safeRedirect(input.url) : true)) return null;
  const record: LegacyTrackingCapability = { v: 1, p: input.p, t: input.t, r: input.r, exp: nowSeconds + ttl };
  if (input.p === "CLICK") record.url = input.url;
  const payload = Buffer.from(JSON.stringify(record)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLegacyTrackingCapability(
  raw: string | null | undefined,
  expectedPurpose: LegacyTrackingPurpose,
  expectedRecipient: string,
  key: string | undefined = process.env.KOBIA_TRACKING_SIGNING_KEY,
  nowSeconds = Math.floor(Date.now() / 1000),
): LegacyTrackingCapability | null {
  const secret = signingKey(key);
  if (!secret || !raw || raw.length > 4096 || !safeRecipient(expectedRecipient)) return null;
  const match = /^([A-Za-z0-9_-]{12,3500})\.([A-Za-z0-9_-]{43})$/.exec(raw);
  if (!match) return null;
  // noUncheckedIndexedAccess: a regex match does not prove capture indexes.
  const payload = match[1] ?? "";
  const signature = match[2] ?? "";
  if (!payload || !signature) return null;
  const actual = Buffer.from(signature, "base64url");
  const expected = createHmac("sha256", secret).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let parsed: LegacyTrackingCapability;
  try { parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LegacyTrackingCapability; }
  catch { return null; }
  if (parsed?.v !== 1 || parsed.p !== expectedPurpose || parsed.r !== expectedRecipient ||
      !safeSlug(parsed.t) || !Number.isSafeInteger(parsed.exp) ||
      parsed.exp < nowSeconds || parsed.exp > nowSeconds + MAX_TTL_SECONDS ||
      (parsed.p === "OPEN" ? parsed.url !== undefined : !safeRedirect(parsed.url))) return null;
  return parsed;
}
