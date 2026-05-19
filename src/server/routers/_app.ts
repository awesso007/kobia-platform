import { router } from "@/server/trpc";
import { tenantRouter } from "./tenant";
import { userRouter } from "./user";
import { booksRouter } from "./books";

export const appRouter = router({
  tenant: tenantRouter,
  user: userRouter,
  books: booksRouter,
});

export type AppRouter = typeof appRouter;
