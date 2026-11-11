import { PermissionError } from "@/lib/rbac/require-permission";

/** Enforce same-origin for browser mutation routes. Reverse proxies must
 * forward the canonical public origin in CHESS_PUBLIC_ORIGIN. */
export function assertMutationOrigin(request: Request): void {
 const configured = process.env.CHESS_PUBLIC_ORIGIN;
 const expected = configured || new URL(request.url).origin;
 const origin = request.headers.get("origin");
 if (!origin || origin !== expected) throw new PermissionError("record:update");
 const type = request.headers.get("content-type") || "";
 if (!type.toLowerCase().startsWith("application/json")) throw new PermissionError("record:update");
}
