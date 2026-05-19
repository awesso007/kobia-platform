/**
 * KOBIA.AI — Database seed
 *
 * Seeds the first tenant (FIG) and a dev user.
 * Run: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding KOBIA database...");

  // First internal tenant: FIG (Fiscal Integrity Group)
  // Wilfred's accounting firm — Cycle 2 first internal customer
  const fig = await prisma.tenant.upsert({
    where: { slug: "fig" },
    update: {},
    create: {
      slug: "fig",
      name: "Fiscal Integrity Group",
      legalName: "Fiscal Integrity Group LLC",
      tier: "INTERNAL",
      hideKobiaBrand: true,
      primaryColor: "#0F172A",
      secondaryColor: "#3B82F6",
    },
  });
  console.log(`✓ Seeded tenant: ${fig.name} (${fig.slug})`);

  // KOBIA demo tenant — used in marketing demos
  const demo = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "KOBIA Demo Firm",
      tier: "FREE",
      hideKobiaBrand: false,
    },
  });
  console.log(`✓ Seeded tenant: ${demo.name} (${demo.slug})`);

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
