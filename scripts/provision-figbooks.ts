import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const slug = "figbooks";
  let t = await db.tenant.findUnique({ where: { slug } });
  if (!t) {
    t = await db.tenant.create({
      data: {
        slug,
        name: "FIG Books",
        legalName: "Fiscal Integrity Group",
        tier: "FREE",
        onboardingCompleted: false,
        onboardingStep: "industry",
      },
    });
    console.log("CREATED:", t.id, t.slug);
  } else {
    console.log("EXISTS:", t.id, t.slug);
  }
}
main().finally(() => db.$disconnect());
