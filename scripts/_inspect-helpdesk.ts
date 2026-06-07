import { PrismaClient } from "../src/lib/db/generated/tenant";
const url = new URL(process.env.DATABASE_URL as string);
url.searchParams.set("schema", "tenant_acme");
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
(async () => {
  await db.$executeRawUnsafe('SET search_path TO "tenant_acme"');
  const ts = await db.ticket.findMany({
    select: { number: true, subject: true, status: true, priority: true, firstResponseAt: true, resolvedAt: true },
    orderBy: { number: "asc" },
  });
  console.log(JSON.stringify(ts, null, 2));
  await db.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
