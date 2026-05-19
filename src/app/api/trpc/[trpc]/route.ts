import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";

const handler = (req: Request) => {
  // Extract tenant slug from referer or custom header
  const url = new URL(req.url);
  const tenantSlug =
    url.searchParams.get("tenant") ??
    req.headers.get("x-kobia-tenant") ??
    "demo";

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ tenantSlug, req }),
  });
};

export { handler as GET, handler as POST };
