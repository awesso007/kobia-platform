/** Constant-time verification of unguessable booking management tokens. */
import { createHash, timingSafeEqual } from "node:crypto";

export function secureBookingManageTokenMatches(
  supplied: string | null | undefined,
  stored: string | null | undefined,
): boolean {
  // Current issue path generates randomBytes(18).toString("hex") (36 chars).
  // Refuse legacy weak/plain user-selected tokens until separately migrated.
  if (!supplied || !stored || !/^[a-f0-9]{36}$/.test(supplied) || !/^[a-f0-9]{36}$/.test(stored))
    return false;
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(stored).digest();
  return timingSafeEqual(left, right);
}
