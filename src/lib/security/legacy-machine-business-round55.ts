/**
 * Legacy SMS/voice and inbound e-mail lack a businessId on their source
 * accounts, message rows and provider webhooks. A signed provider callback
 * authenticates the account, NOT authority to access all sibling CHESS
 * businesses. Until explicit per-number/account service ownership exists,
 * deny the machine operation in multi-business tenants, including histories
 * with a now-inactive second business unit.
 *
 * Applicable both to normal tenant clients and transaction clients.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
type BusinessScopeReader = Pick<PrismaClient, "chessBusinessUnit">;

export function legacyMachineBusinessAllowed(
  units: ReadonlyArray<{ status: string }>,
): boolean {
  return units.length === 0 || (units.length === 1 && units[0]?.status === "ACTIVE");
}
export async function requireSingleLegacyMachineBusiness(db: BusinessScopeReader): Promise<void> {
  const units = await db.chessBusinessUnit.findMany({
    select: { id: true, status: true }, take: 2,
  });
  if (!legacyMachineBusinessAllowed(units))
    throw new Error("Legacy machine business ownership unavailable");
}
