/**
 * One-shot: mark existing tenants (FIG + demo + any pre-onboarding tenant) as already onboarded
 * so the new /welcome flow doesn't kick in for them.
 *
 * Run with:
 *   npx tsx scripts/mark-tenants-onboarded.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Mark every existing tenant as already onboarded — they have entities + activity.
  // New tenants going forward will be created with onboardingCompleted=false by provisionTenantFromPending.
  const result = await db.tenant.updateMany({
    where: {
      onboardingCompleted: false,
    },
    data: {
      onboardingCompleted: true,
      onboardingStep: "done",
    },
  });

  console.log(`Marked ${result.count} existing tenant(s) as onboarded.`);

  const all = await db.tenant.findMany({
    select: { slug: true, name: true, onboardingCompleted: true, onboardingStep: true },
  });
  console.table(all);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
