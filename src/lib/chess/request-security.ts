import { PermissionError } from "@/lib/rbac/require-permission";

/** Enforce same-origin for browser mutation routes. Reverse proxies must
 * forward the canonical public origin in CHESS_PUBLIC_ORIGIN. */
export function assertMutationOrigin(request: Request): void {
 const configured = process.env.CHESS_PUBLIC_ORIGIN;
 if(process.env.NODE_ENV==="production"&&!configured)
  throw new PermissionError("record:update");
 const expected = configured || new URL(request.url).origin;
 const origin = request.headers.get("origin");
 if (!origin || origin !== expected) throw new PermissionError("record:update");
 const type = request.headers.get("content-type") || "";
 if (!/^application\/json(?:\s*;|\s*$)/i.test(type))
  throw new PermissionError("record:update");
 if(request.headers.get("sec-fetch-site")==="cross-site")
  throw new PermissionError("record:update");
}
