/**
 * Small pure policy predicates used by legacy mutations whose selectors were
 * previously accepted before a live tenant/member/parent check.
 * These are not substitutes for a DB transaction or a Clerk user session.
 */
export function safeHistoricalTenantSlug(value: unknown): string | null {
  return typeof value === "string" &&
    /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(value) ? value : null;
}
export function moduleTenantAuthorized(
  slug: string,
  registry: { status: string; schemaName: string } | null,
  member: { status: string } | null,
): boolean {
  if (!safeHistoricalTenantSlug(slug)) return false;
  return registry?.status === "ACTIVE" &&
    registry.schemaName === "tenant_" + slug.replace(/-/g, "_") &&
    member?.status === "ACTIVE";
}
export const MAX_LOCAL_UPLOAD_BYTES = 25 * 1024 * 1024;
export function localUploadIsAuthorized(input: {
  actorUserId: string | null;
  tenantSlug: string;
  storageKey: string;
  provider: string;
  status: string;
  uploadedByClerkUserId: string | null;
  declaredSize: bigint;
  actualSize: number;
}): boolean {
  return !!input.actorUserId && !!safeHistoricalTenantSlug(input.tenantSlug) &&
    input.provider === "LOCAL" && input.status === "UPLOADING" &&
    input.uploadedByClerkUserId === input.actorUserId &&
    input.storageKey.startsWith(`tenants/${input.tenantSlug}/`) &&
    Number.isSafeInteger(input.actualSize) &&
    input.actualSize > 0 && input.actualSize <= MAX_LOCAL_UPLOAD_BYTES &&
    input.declaredSize === BigInt(input.actualSize);
}
export function binaryMutationSameOrigin(
  request: Pick<Request,"headers"|"url">,
  configuredOrigin: string | undefined,
  isProduction: boolean,
): boolean {
  if (isProduction && !configuredOrigin) return false;
  const expected = configuredOrigin ?? new URL(request.url).origin;
  return request.headers.get("origin") === expected &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}
