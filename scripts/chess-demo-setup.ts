/**
 * Round 18 Codespaces demo: separate fictional CHESS tenant, never live data.
 * Run: npm run demo:setup after configuring .env.local and npm ci.
 * The script checks every safety precondition BEFORE running migrations.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import {
  CHESS_DEMO_SCHEMA, CHESS_DEMO_SLUG, validateChessDemoEnvironment,
} from "../src/lib/chess/demo-mode";

const { databaseUrl } = validateChessDemoEnvironment(process.env);
process.env.DIRECT_URL = databaseUrl;
const prismaCli = resolve("node_modules/prisma/build/index.js");

function migrate(schemaFile: string, scopedUrl = databaseUrl): void {
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema=" + schemaFile], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: scopedUrl, DIRECT_URL: scopedUrl },
  });
}

type DemoService =
  "ACCOUNTING" | "BOOKKEEPING" | "PAYROLL" | "TAX" |
  "MORTGAGE" | "INSURANCE" | "REAL_ESTATE" | "INVESTMENTS";
const units: { slug: string; name: string; service: DemoService }[] = [
  { slug: "accounting", name: "CHESS Accounting (Demo)", service: "ACCOUNTING" },
  { slug: "bookkeeping", name: "CHESS Bookkeeping & Payroll (Demo)", service: "BOOKKEEPING" },
  { slug: "payroll", name: "CHESS Payroll Desk (Demo)", service: "PAYROLL" },
  { slug: "tax", name: "CHESS Tax Services (Demo)", service: "TAX" },
  { slug: "mortgage", name: "CHESS Mortgage Group (Demo)", service: "MORTGAGE" },
  { slug: "insurance", name: "CHESS Insurance (Demo)", service: "INSURANCE" },
  { slug: "homes", name: "CHESS Homes (Demo)", service: "REAL_ESTATE" },
  { slug: "investments", name: "CHESS Investment & Management (Demo)", service: "INVESTMENTS" },
];
const staff = [
  { clerkUserId: "user_fictional_chess_manager", email: "manager@example.invalid", displayName: "Jordan Example", role: "ADMIN" as const },
  { clerkUserId: "user_fictional_chess_staff_one", email: "staff-one@example.invalid", displayName: "Taylor Sample", role: "MEMBER" as const },
  { clerkUserId: "user_fictional_chess_staff_two", email: "staff-two@example.invalid", displayName: "Avery Fictional", role: "MEMBER" as const },
];
const clients = [
  { firstName: "Morgan", lastName: "Fictional", email: "morgan@example.invalid" },
  { firstName: "Riley", lastName: "Sample", email: "riley@example.invalid" },
  { firstName: "Jamie", lastName: "Example", email: "jamie@example.invalid" },
  { firstName: "Casey", lastName: "Imaginary", email: "casey@example.invalid" },
  { firstName: "Parker", lastName: "Mock", email: "parker@example.invalid" },
];

async function main() {
  const { PrismaClient: PlatformClient } = await import("../src/lib/db/generated/platform");
  const platform = new PlatformClient({ datasources: { db: { url: databaseUrl } } });
  try {
    migrate("prisma/platform/schema.prisma");
    // Fixed schema identifier: no user interpolation in CREATE SCHEMA.
    await platform.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "tenant_chess_demo"');
    const scopedMigrationUrl = new URL(databaseUrl);
    scopedMigrationUrl.searchParams.set("schema", CHESS_DEMO_SCHEMA);
    migrate("prisma/tenant/schema.prisma", scopedMigrationUrl.toString());
    const existing = await platform.tenantRegistry.findUnique({ where: { slug: CHESS_DEMO_SLUG } });
    if (existing && existing.schemaName !== CHESS_DEMO_SCHEMA) {
      throw new Error("Refusing to overwrite an existing tenant mapping.");
    }
    await platform.tenantRegistry.upsert({
      where: { slug: CHESS_DEMO_SLUG },
      create: {
        slug: CHESS_DEMO_SLUG, schemaName: CHESS_DEMO_SCHEMA, status: "ACTIVE",
        plan: "DEMO", displayName: "CHESS Corporation - FICTIONAL SANDBOX",
      },
      update: { displayName: "CHESS Corporation - FICTIONAL SANDBOX" },
    });
  } finally {
    await platform.$disconnect();
  }

  const { PrismaClient: TenantClient } = await import("../src/lib/db/generated/tenant");
  const schemaUrl = new URL(databaseUrl);
  schemaUrl.searchParams.set("schema", CHESS_DEMO_SCHEMA);
  const db = new TenantClient({ datasources: { db: { url: schemaUrl.toString() } } });
  try {
    for (const employee of staff) {
      await db.membership.upsert({
        where: { clerkUserId: employee.clerkUserId },
        create: { ...employee, status: "ACTIVE" },
        update: { displayName: employee.displayName },
      });
    }
    const businessIds: string[] = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i]!;
      const unit = await db.chessBusinessUnit.upsert({
        where: { slug: u.slug },
        create: { slug: u.slug, name: u.name },
        update: { name: u.name },
      });
      businessIds.push(unit.id);
      for (const employee of staff) {
        await db.chessEmployeeAssignment.upsert({
          where: { businessId_clerkUserId: {
            businessId: unit.id, clerkUserId: employee.clerkUserId,
          } },
          create: {
            businessId: unit.id, clerkUserId: employee.clerkUserId,
            role: employee.role === "ADMIN" ? "MANAGER" : "SUPPORT",
          },
          update: { revokedAt: null },
        });
      }
      const title = "Fictional " + u.service.toLowerCase().replaceAll("_", " ") + " client follow-up";
      const existingWork = await db.chessWorkItem.findFirst({
        where: { businessId: unit.id, title },
      });
      if (!existingWork) {
        await db.chessWorkItem.create({
          data: { businessId: unit.id, title,
            assignedClerkUserId: staff[i % staff.length]!.clerkUserId },
        });
      }
    }

    const companyName = "Fictional Example Ventures";
    let company = await db.company.findFirst({ where: { name: companyName } });
    if (!company) company = await db.company.create({
      data: { name: companyName, domain: "example.invalid" },
    });
    for (let i = 0; i < clients.length; i++) {
      const client = clients[i]!;
      let contact = await db.contact.findFirst({ where: { email: client.email } });
      if (!contact) contact = await db.contact.create({
        data: { ...client, companyId: company.id },
      });
      const displayName = client.firstName + " " + client.lastName + " (FICTIONAL)";
      let profile = await db.clientProfile.findFirst({ where: { contactId: contact.id } });
      if (!profile) profile = await db.clientProfile.create({
        data: { displayName, contactId: contact.id },
      });
      // Relationships have NO service grants. Pending consent never authorizes access.
      for (const offset of [i % units.length, (i + 4) % units.length]) {
        await db.clientServiceLink.upsert({
          where: { profileId_businessId_service: {
            profileId: profile.id, businessId: businessIds[offset]!,
            service: units[offset]!.service,
          } },
          create: {
            profileId: profile.id, businessId: businessIds[offset]!,
            service: units[offset]!.service,
          },
          update: {},
        });
      }

      // Seed only a PENDING fictional disclosure. A seed is NEVER verified
      // consent, and never confers permission to access a service record.
      const unitOffset = i % units.length;
      const pending = await db.chessClientConsent.findFirst({
        where: {
          businessId: businessIds[unitOffset]!,
          clientProfileId: profile.id,
          purpose: "service:" + units[unitOffset]!.service,
          policyVersion: "fictional-demo-v1",
        },
        select: { id: true },
      });
      if (!pending) {
        await db.chessClientConsent.create({
          data: {
            businessId: businessIds[unitOffset]!,
            clientProfileId: profile.id,
            purpose: "service:" + units[unitOffset]!.service,
            policyVersion: "fictional-demo-v1",
            policyText: "FICTIONAL DEMO DISCLOSURE ONLY. This is a sample pending request. "+
              "No real client has signed, accepted or authorized any data sharing.",
          },
        });
      }
    }

    for (const title of ["Review fictional client intake", "Prepare sample bookkeeping checklist",
      "Test employee task assignment", "Check fictional payroll calendar"]) {
      if (await db.task.count({ where: { title, deletedAt: null } }) === 0) {
        await db.task.create({
          data: { title, assigneeClerkUserId: staff[1]!.clerkUserId },
        });
      }
    }
    console.log("FICTIONAL demo seeded: 1 tenant, 8 business units, 3 staff, 5 clients.");
    console.log("All external financial and regulated integrations remain OFF.");
    console.log("Sign in at /chess-demo/login with the verified CHESS_DEMO_OWNER_EMAIL");
    console.log("then visit /app/overview to claim your demo-only OWNER membership.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("[demo:setup] Failed safely:", error);
  process.exitCode = 1;
});
