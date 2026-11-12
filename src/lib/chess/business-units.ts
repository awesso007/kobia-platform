import { z } from "zod";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import {revokeBusinessAssignmentAndServiceGrants} from "./business-assignment-revocation";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

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
  // A former owner must not regain access by reusing an older authenticated
  // page after its role is revoked. The recheck, assignment and audit are one
  // SERIALIZABLE transaction. A failed audit rolls back the assignment.
  return db.$transaction(async tx=>{
    const [current,business,employee]=await Promise.all([
      tx.membership.findUnique({
        where:{clerkUserId:user.clerkUserId},select:{status:true,role:true},
      }),
      tx.chessBusinessUnit.findUnique({
        where:{id:data.businessId},select:{status:true},
      }),
      tx.membership.findUnique({
        where:{clerkUserId:data.clerkUserId},select:{status:true,role:true},
      }),
    ]);
    if(current?.status!=="ACTIVE"||!isBusinessAdmin(current.role)||
       business?.status!=="ACTIVE"||employee?.status!=="ACTIVE"||
       employee.role==="VIEWER"){
      throw new PermissionError("member:manage");
    }
    const assigned=await tx.chessEmployeeAssignment.upsert({
      where:{businessId_clerkUserId:{
        businessId:data.businessId,clerkUserId:data.clerkUserId,
      }},
      create:data,
      update:{role:data.role,revokedAt:null},
      select:{id:true,businessId:true,clerkUserId:true,role:true,revokedAt:true},
    });
    await tx.chessSecurityEvent.create({data:{
      businessId:data.businessId,actorClerkUserId:user.clerkUserId,
      action:"BUSINESS_EMPLOYEE_ASSIGNED",resourceType:"ChessEmployeeAssignment",
      resourceId:assigned.id,decision:"ALLOW",
    }});
    return assigned;
  },{isolationLevel:"Serializable"});
}

export async function revokeEmployeeAssignment(businessId: string, clerkUserId: string) {
  const user = await actor();
  if (!isBusinessAdmin(user.role)) throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  return revokeBusinessAssignmentAndServiceGrants(db,businessId,
    clerkUserId,user.clerkUserId);
}


/** Explicit owner/admin-only staff provisioning directory. Does not expose
 * individual client profiles, service links, private documents or credentials. */
export async function getChessBusinessAssignmentAdmin(businessId: string) {
  await assertBusinessAccess(businessId);
  const user = await actor();
  if (!isBusinessAdmin(user.role)) throw new PermissionError("member:manage");
  const { db } = getTenantDb();
  return auditedChessSensitiveRead(db,{
    businessId,actorClerkUserId:user.clerkUserId,
    action:"BUSINESS_STAFF_ADMIN_READ",resourceType:"ChessEmployeeAssignment",
    resourceId:"business:"+businessId,
  },async tx=>{
    // A role revoked between entry and reading another employee's membership
    // must not release a staff directory. The SELECT and audit commit together.
    const [current,unit]=await Promise.all([
      tx.membership.findUnique({where:{clerkUserId:user.clerkUserId},
       select:{status:true,role:true}}),
      tx.chessBusinessUnit.findUnique({where:{id:businessId},
       select:{status:true}}),
    ]);
    if(current?.status!=="ACTIVE"||!isBusinessAdmin(current.role)||
       unit?.status!=="ACTIVE")return null;
    const [members,assignments]=await Promise.all([
      tx.membership.findMany({
        where:{status:"ACTIVE",role:{not:"VIEWER"}},
        select:{clerkUserId:true,displayName:true,role:true},
        orderBy:{joinedAt:"asc"},take:100,
      }),
      tx.chessEmployeeAssignment.findMany({
        where:{businessId,revokedAt:null},
        select:{id:true,clerkUserId:true,role:true,assignedAt:true},
        orderBy:{assignedAt:"asc"},take:100,
      }),
    ]);
    return {members,assignments};
  });
}
