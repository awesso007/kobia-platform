import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "@/server/trpc";
import { db } from "@/lib/db";

export const tenantRouter = router({
  /** Get the current tenant from context. */
  current: protectedProcedure.query(({ ctx }) => {
    return ctx.auth.tenant;
  }),

  /** Public: resolve tenant by slug (for login page branding). */
  bySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const tenant = await db.tenant.findUnique({
        where: { slug: input.slug.toLowerCase() },
        select: {
          slug: true,
          name: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          tier: true,
          hideKobiaBrand: true,
        },
      });
      return tenant;
    }),

  /** Update tenant branding (owners/admins only). */
  updateBranding: protectedProcedure
    .input(
      z.object({
        logoUrl: z.string().url().optional().nullable(),
        primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!["OWNER", "ADMIN"].includes(ctx.auth.role)) {
        throw new Error("Forbidden");
      }
      return db.tenant.update({
        where: { id: ctx.auth.tenant.id },
        data: input,
      });
    }),
});
