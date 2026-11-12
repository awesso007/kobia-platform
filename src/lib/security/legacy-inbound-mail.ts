/**
 * Round 48: legacy inbound email is a machine callback, not a session route.
 * Never infer a tenant from a partial address or fall back to a demo/default
 * tenant; never accept a short or unconfigured shared relay credential.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export type InboundCredentialDecision = "AUTHORIZED" | "UNAUTHORIZED" | "UNCONFIGURED";

export function inboundMailCredentialDecision(
  supplied: string | null,
  configured: string | undefined,
): InboundCredentialDecision {
  if (!configured || Buffer.byteLength(configured, "utf8") < 32) return "UNCONFIGURED";
  const a = createHash("sha256").update(supplied ?? "").digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b) ? "AUTHORIZED" : "UNAUTHORIZED";
}

export function inboundMailTenantSlug(
  rawAddress: string,
  configuredDomain: string | undefined = "inbound.kobia.ai",
): string | null {
  const domain = (configuredDomain ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{2,240}$/.test(domain) || domain.includes("..")) return null;
  const address = rawAddress.trim().toLowerCase();
  if (address.length > 320) return null;
  const suffix = `@${domain}`;
  if (!address.endsWith(suffix)) return null;
  const local = address.slice(0, -suffix.length);
  if (!local.startsWith("kobia+")) return null;
  const slug = local.slice(6);
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(slug) ? slug : null;
}
