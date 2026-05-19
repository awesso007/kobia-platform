/**
 * tRPC server setup with tenant-aware context.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth";

export type CreateContextOptions = {
  tenantSlug: string;
  req: Request;
};

export async function createTRPCContext(opts: CreateContextOptions) {
  const auth = await getAuthContext(opts.tenantSlug);
  return { auth, req: opts.req };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth as AuthContext } });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
