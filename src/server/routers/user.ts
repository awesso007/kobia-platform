import { router, protectedProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const userRouter = router({
  /** Get the current user. */
  me: protectedProcedure.query(({ ctx }) => {
    return ctx.auth.user;
  }),

  /** List all members of the current tenant. */
  listMembers: protectedProcedure.query(async ({ ctx }) => {
    return db.membership.findMany({
      where: { tenantId: ctx.auth.tenant.id, isActive: true },
      include: { user: true },
      orderBy: { invitedAt: "desc" },
    });
  }),
});
