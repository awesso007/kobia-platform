/**
 * tRPC server setup with tenant-aware context.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import {db} from "@/lib/db";

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

/** Audits every successful protected tRPC query before its result leaves the
 * procedure. Public tenant.bySlug branding is intentionally outside this
 * private-read boundary. This is an after-query fail-closed release gate:
 * it does not make an arbitrary legacy SELECT share the audit transaction. */
const auditProtectedQuery = t.middleware(async ({ctx,path,type,next})=>{
 const result=await next();
 if(type!=="query"||!result.ok)return result;
 if(!ctx.auth)throw new TRPCError({code:"UNAUTHORIZED"});
 try{
  await db.$transaction(async tx=>{
   const membership=await tx.membership.findUnique({where:{
    userId_tenantId:{userId:ctx.auth!.user.id,tenantId:ctx.auth!.tenant.id},
   },select:{isActive:true}});
   if(!membership?.isActive)
    throw new TRPCError({code:"FORBIDDEN"});
   await tx.auditLog.create({data:{
    tenantId:ctx.auth!.tenant.id,userId:ctx.auth!.user.id,
    action:"HISTORICAL_TRPC_PROTECTED_QUERY_READ",
    entityType:"TRPC_PROCEDURE",entityId:path,
   }});
  },{isolationLevel:"Serializable"});
 }catch{
  throw new TRPCError({code:"INTERNAL_SERVER_ERROR",
   message:"Protected query audit unavailable"});
 }
 return result;
});

export const protectedProcedure = t.procedure.use(enforceAuth).use(auditProtectedQuery);
