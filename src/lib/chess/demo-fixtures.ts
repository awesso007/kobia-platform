/**
 * Pure fixture seeding, exercised against an ephemeral PostgreSQL CI tenant.
 * Never call this for a live tenant. The only interactive entrypoint is
 * scripts/chess-demo-setup.ts, which enforces isolated Neon and test-Clerk gates.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

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


export async function seedChessDemoRecords(db: PrismaClient): Promise<void> {
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
        update: {}, // Never reinstate a revoked demo assignment.
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
}


/** Post-seed integrity check: never report a usable demo if fictional
 * subjects accidentally gain active grants, fabricated accepted consent,
 * verified practitioner credentials or money-moving service records. */
export async function verifyChessDemoRecords(db: PrismaClient): Promise<{
  businessUnits: number;
  employeeAssignments: number;
  clients: number;
  pendingDisclosures: number;
}> {
  const businessUnits = await db.chessBusinessUnit.findMany({
    where: { slug: { in: units.map(u=>u.slug) }, status: "ACTIVE" }, select: { id: true },
  });
  const ids = businessUnits.map(b=>b.id);
  const profileRows = await db.clientProfile.findMany({
    where: { displayName: { in: clients.map(c=>
      c.firstName+" "+c.lastName+" (FICTIONAL)") } },
    select: { id: true },
  });
  const profileIds = profileRows.map(p=>p.id);
  const links = await db.clientServiceLink.findMany({
    where: { businessId: { in: ids }, profileId: { in: profileIds } },
    select: { id: true },
  });
  const [assignments,grants,consents,credentials,cases,invoices,items] =
    await Promise.all([
      db.chessEmployeeAssignment.count({where:{
        businessId:{in:ids},revokedAt:null,
      }}),
      db.clientServiceGrant.count({where:{linkId:{in:links.map(l=>l.id)}}}),
      db.chessClientConsent.findMany({where:{
        businessId:{in:ids},clientProfileId:{in:profileIds},
        policyVersion:"fictional-demo-v1",
      },select:{status:true,consentedAt:true,acceptedByClerkUserId:true,
        verifiedEmailDigest:true,acceptanceEvidenceDigest:true}}),
      db.chessPractitionerCredential.count({where:{businessId:{in:ids}}}),
      db.chessServiceCase.count({where:{businessId:{in:ids}}}),
      db.chessBillingInvoice.count({where:{businessId:{in:ids}}}),
      db.chessWorkItem.count({where:{businessId:{in:ids},title:{in:units.map(u=>
        "Fictional "+u.service.toLowerCase().replaceAll("_"," ")+" client follow-up")}}}),
    ]);
  const pending = consents.every(c=>c.status==="PENDING" &&
    !c.consentedAt && !c.acceptedByClerkUserId &&
    !c.verifiedEmailDigest && !c.acceptanceEvidenceDigest);
  if(businessUnits.length!==8 || assignments!==24 || profileRows.length!==5 ||
    links.length!==10 || consents.length!==5 || items!==8 ||
    grants!==0 || credentials!==0 || cases!==0 || invoices!==0 || !pending) {
    throw new Error("Refusing success: CHESS fictional fixture integrity or isolation check failed.");
  }
  return {businessUnits:8,employeeAssignments:24,clients:5,pendingDisclosures:5};
}
