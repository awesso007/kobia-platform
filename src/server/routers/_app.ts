import { router } from "@/server/trpc";
import { tenantRouter } from "./tenant";
import { userRouter } from "./user";
import { booksRouter } from "./books";
import { billingRouter } from "./billing";

export const appRouter = router({
  tenant: tenantRouter,
  user: userRouter,
  books: booksRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
