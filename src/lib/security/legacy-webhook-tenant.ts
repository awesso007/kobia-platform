/**
 * Legacy signed callback tenant boundary. Validating the tenant selector does
 * NOT authenticate a callback: the route first verifies the vendor signature
 * over the exact callback URL and parameters, then checks the live registry.
 */
import { getPlatformDb } from "@/lib/db/platform";
import { schemaNameForSlug } from "@/lib/db/tenant-prisma";

export function validatedWebhookTenantSlug(value: string | null): string | null {
  if (!value) return null;
  return /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value) ? value : null;
}

export function registeredWebhookSchema(
  slug: string,
  row: { status: string; schemaName: string } | null,
): string | null {
  const expected = schemaNameForSlug(slug);
  return row?.status === "ACTIVE" && row.schemaName === expected ? expected : null;
}

export async function activeWebhookTenantSchema(slug: string): Promise<string | null> {
  if (!validatedWebhookTenantSlug(slug)) return null;
  const registry = await getPlatformDb().tenantRegistry.findUnique({
    where: { slug }, select: { status: true, schemaName: true },
  });
  return registeredWebhookSchema(slug, registry);
}

/**
 * Twilio signature inputs are small application/x-www-form-urlencoded payloads.
 * Parse with an upper bound and reject duplicate keys before signature check
 * so neither parser ambiguity nor arbitrary uploads exhaust the API.
 */
import { timingSafeEqual } from "node:crypto";
import { readPublicFormBody } from "./public-form-abuse";

export async function readBoundedTwilioParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") throw new Error("Invalid Twilio payload");
  const raw = await readPublicFormBody(request, 16384);
  const entries = new URLSearchParams(new TextDecoder().decode(raw));
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  let count = 0;
  for (const [key, value] of entries) {
    if (++count > 64 || !/^[A-Za-z][A-Za-z0-9]{0,50}$/.test(key) ||
        value.length > 4096 || Object.prototype.hasOwnProperty.call(result, key))
      throw new Error("Invalid Twilio payload");
    result[key] = value;
  }
  return result;
}
/** Signature alone is insufficient if a shared vendor account routes to a
 * different tenant. Confirm the callback's sender account equals our account. */
export function twilioAccountMatches(
  supplied: string | undefined,
  expected: string | undefined = process.env.TWILIO_ACCOUNT_SID,
): boolean {
  if (!supplied || !expected ||
      !/^AC[0-9a-fA-F]{32}$/.test(supplied) ||
      !/^AC[0-9a-fA-F]{32}$/.test(expected)) return false;
  const a = Buffer.from(supplied, "ascii");
  const b = Buffer.from(expected, "ascii");
  return a.length === b.length && timingSafeEqual(a, b);
}
