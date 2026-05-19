/**
 * Bookkeeping router — stub for Cycle 2.
 * Cycle 1 only exposes a healthcheck.
 */
import { router, protectedProcedure } from "@/server/trpc";

export const booksRouter = router({
  status: protectedProcedure.query(({ ctx }) => {
    return {
      tenantId: ctx.auth.tenant.id,
      tenantName: ctx.auth.tenant.name,
      module: "books",
      cycle: 1,
      status: "scaffold-only",
      message: "Bookkeeping module ships in Cycle 2 (Jul-Aug 2026).",
    };
  }),
});
