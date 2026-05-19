import { router } from "@/server/trpc";
import { tenantRouter } from "./tenant";
import { userRouter } from "./user";
import { booksRouter } from "./books";
import { billingRouter } from "./billing";
import { arRouter } from "./ar";
import { apRouter } from "./ap";
import { bankRouter } from "./bank";

export const appRouter = router({
  tenant: tenantRouter,
  user: userRouter,
  books: booksRouter,
  billing: billingRouter,
  ar: arRouter,
  ap: apRouter,
  bank: bankRouter,
});

export type AppRouter = typeof appRouter;
