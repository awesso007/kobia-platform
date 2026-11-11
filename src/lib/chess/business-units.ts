import { z } from "zod";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";

export const businessUnitInput = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  name: z.string().trim().min(2).max(150),
  legalName: z.string().trim().min(2).max(250).optional(),
}).strict();

export const assignmentInput = z.object({
  businessId: z.string().min(1).max(128),
  clerkUserId: z.string().min(1).max(128),
  role: z.enum(["MANAGER", "PRACTITIONER", "SUPPORT"]),
}).strict();

async function actor() {
  const user = await getCurrentMembership();
  if (!user || user.status !== "ACTIVE") throw new PermissionError("workspace:manage");
  return user;
}

export function isBusinessAdmin(role: string): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export async function createBusinessUnit(input: unknown) {
  const user = await actor();
  if (!isBusinessAdmin(user.role)) throw new PermissionError("workspace:manage");
  const data = businessUnitInput.parse(input);
  const { db } = getTenantDb();
  return db.chessBusinessUnit.create({
    data, select: { id: true, slug: true, name: true, legalName: true, status: true },
  });
}

/** Members see only business units they are currently assigned to. */
export async function listBusinessUnits() {
  const user = await actor();
  const { db } = getTenantDb();
  return db.chessBusinessUnit.findMany({
    where: {
      status: "ACTIVE",
      ...(!isBusinessAdmin(user.role) && {
        assignments: { some: { clerkUserId: user.clerkUserId, revokedAt: null } },
      }),
    },
    select: { id: true, slug: true, name: true, status: true },
    orderBy: { name: "asc" }, take: 100,
  });
}

export async function assertBusinessAccess(businessId: string): Promise<void> {
  const user = await actor();
  const { db } = getTenantDb();
  const business = await db.chessBusinessUnit.findUnique({
    where: { id: businessId },
    select: { status: true, assignments: { where: {
      clerkUserId: user.clerkUserId, revokedAt: null,
    }, select: { id: true } } },
  });
  if (!business || business.status !== "ACTIVE" ||
      (!isBusinessAdmin(user.role) && business.assignments.length === 0)) {
    throw new PermissionError("record:read");
  }
}

export async function assignEmployee(input: unknown) {
  const user = await actor();
  if (!isBusinessAdmin(user.role)) throw new PermissionError("member:manage");
  const data = assignmentInput.parse(input);
  const { db } = getTenantDb();
  const [business, employee] = await Promise.all([
    db.chessBusinessUnit.findUnique({ where: { id: data.businessId }, select: { status: true } }),
    db.membership.findUnique({ where: { clerkUserId: data.clerkUserId }, select: { status: true, role: true } }),
  ]);
  if (!business || business.status !== "ACTIVE" ||
      !employee || employee.status !== "ACTIVE" || employee.role === "VIEWER") {
    throw new PermissionError("member:manage");
  }
  return db.chessEmployeeAssignment.upsert({
    where: { businessId_clerkUserId: { businessId: data.businessId, clerkUserId: data.clerkUserId } },
    create: data,
    update: { role: data.role, revokedAt: null },
    select: { id: true, businessId: true, clerkUserId: true, role: true, revokedAt: true },
  });
}

export async function revokeEmployeeAssignment(businessId: string, clerkUserId: string) {
  const user = await actor();
  if (!isBusinessAdmin(user.role)) throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  return db.chessEmployeeAssignment.updateMany({
    where: { businessId, clerkUserId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
