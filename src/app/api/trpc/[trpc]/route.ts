import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createTRPCContext } from "@/server/trpc";

const handler = (req: Request) => {
  // Do not silently fall back to the demo tenant. Header/query are only
  // selectors, never authorization: getAuthContext checks active membership.
  const url = new URL(req.url);
  const queryTenant=url.searchParams.get("tenant");
  const headerTenant=req.headers.get("x-kobia-tenant");
  const tenantSlug=queryTenant??headerTenant;
  if(!tenantSlug||!(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/).test(tenantSlug)||
     (queryTenant&&headerTenant&&queryTenant!==headerTenant))
   return new Response(JSON.stringify({error:"Explicit tenant required"}),{
    status:403,headers:{"Cache-Control":"no-store",
     "Content-Type":"application/json"},
   });

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ tenantSlug, req }),
  });
};

export { handler as GET, handler as POST };
