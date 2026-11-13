/**
 * tRPC server setup with tenant-aware context.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/auth";
import {db} from "@/lib/db";
import {withLegacyTrpcReadScope,withLegacyTrpcMutationScope} from "./trpc-read-scope";

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

/** Protected tRPC read transactions are separate from legacy tenant-schema
 * Prisma: the legacy accounting database holds its own membership and AuditLog.
 * A successful protected query cannot release data until its transaction
 * commits both SELECT and privacy-minimal event. */
const auditProtectedQuery = t.middleware(async ({ctx,path,type,next})=>{
 if(type!=="query")return next();
 if(!ctx.auth)throw new TRPCError({code:"UNAUTHORIZED"});
 try{
  const result=await db.$transaction(async tx=>{
   const [liveUser,liveTenant,liveMembership]=await Promise.all([
    tx.user.findUnique({where:{id:ctx.auth!.user.id}}),
    tx.tenant.findUnique({where:{id:ctx.auth!.tenant.id}}),
    tx.membership.findUnique({where:{
     userId_tenantId:{userId:ctx.auth!.user.id,tenantId:ctx.auth!.tenant.id},
    }}),
   ]);
   const allowed=!!liveUser && liveUser.clerkUserId===ctx.auth!.user.clerkUserId &&
     !!liveTenant && liveTenant.isActive &&
     !!liveMembership && liveMembership.isActive;
   if(!allowed){
    await tx.auditLog.create({data:{
     tenantId:ctx.auth!.tenant.id,userId:ctx.auth!.user.id,
     action:"HISTORICAL_TRPC_PROTECTED_QUERY_DENIED",
     entityType:"TRPC_PROCEDURE",entityId:path,
    }});
    return {allowed:false as const};
   }
   const auth={
    user:liveUser!,tenant:liveTenant!,membership:liveMembership!,
    role:liveMembership!.role,
   };
   const execution=await withLegacyTrpcReadScope({
    tenantId:liveTenant!.id,userId:liveUser!.id,tx,
   },async()=>next({ctx:{...ctx,auth}}));
   await tx.auditLog.create({data:{
    tenantId:liveTenant!.id,userId:liveUser!.id,
    action:execution.ok?"HISTORICAL_TRPC_PROTECTED_QUERY_READ_ATOMIC":
      "HISTORICAL_TRPC_PROTECTED_QUERY_DENIED",
    entityType:"TRPC_PROCEDURE",entityId:path,
   }});
   return {allowed:true as const,execution};
  },{isolationLevel:"Serializable",maxWait:5000,timeout:30000});
  if(!result.allowed)throw new TRPCError({code:"FORBIDDEN"});
  return result.execution;
 }catch(error){
  if(error instanceof TRPCError&&error.code==="FORBIDDEN")throw error;
  throw new TRPCError({code:"INTERNAL_SERVER_ERROR",
   message:"Protected query transaction unavailable"});
 }
});

/** Round 57: every authenticated tRPC mutation must be a single, live-
 * authorized legacy-ledger transaction. This audit is in the SAME database
 * commit, not a best-effort post-write record. A resolver that bypasses the
 * transaction selector (or invokes nested transactions) fails closed. */
const auditProtectedMutation = t.middleware(async ({ctx,path,type,next})=>{
 if(type!=="mutation")return next();
 if(!ctx.auth)throw new TRPCError({code:"UNAUTHORIZED"});
 try{
  const outcome=await db.$transaction(async tx=>{
   const [user,tenant,membership]=await Promise.all([
    tx.user.findUnique({where:{id:ctx.auth!.user.id}}),
    tx.tenant.findUnique({where:{id:ctx.auth!.tenant.id}}),
    tx.membership.findUnique({where:{userId_tenantId:{
     userId:ctx.auth!.user.id,tenantId:ctx.auth!.tenant.id,
    }}}),
   ]);
   if(!user||user.clerkUserId!==ctx.auth!.user.clerkUserId||
      !tenant||!tenant.isActive||!membership||!membership.isActive)
    return {allowed:false as const};
   const auth={user,tenant,membership,role:membership.role};
   const executed=await withLegacyTrpcMutationScope({
    tenantId:tenant.id,userId:user.id,tx,
   },async scope=>{
    const res=await next({ctx:{...ctx,auth}});
    if(!res.ok || scope.mutations===0)
     throw new Error("Historical tRPC mutation failed or escaped the audited transaction");
    return res;
   });
   await tx.auditLog.create({data:{
    tenantId:tenant.id,userId:user.id,
    action:"HISTORICAL_TRPC_PROTECTED_MUTATION_ATOMIC",
    entityType:"TRPC_PROCEDURE",entityId:path,
   }});
   return {allowed:true as const,execution:executed};
  },{isolationLevel:"Serializable",maxWait:5000,timeout:30000});
  if(!outcome.allowed)throw new TRPCError({code:"FORBIDDEN"});
  return outcome.execution;
 }catch(error){
  if(error instanceof TRPCError&&error.code==="FORBIDDEN")throw error;
  throw new TRPCError({code:"INTERNAL_SERVER_ERROR",
   message:"Protected mutation transaction unavailable"});
 }
});

export const protectedProcedure = t.procedure.use(enforceAuth).use(auditProtectedQuery).use(auditProtectedMutation);
