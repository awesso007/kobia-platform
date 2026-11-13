import { describe, expect, it, vi } from "vitest";
import { PermissionError } from "@/lib/rbac/require-permission";
import {
  liveLegacyLeadActor, withAuditedLegacyLeadMutation,
  withAuditedLegacyLeadRead, legacyOwnerFilter,
} from "./legacy-lead-security-round54";

function context(input: {
  role?: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  memberStatus?: string;
  units?: {id:string;status:string}[];
  assigned?: boolean;
  revoked?: boolean;
} = {}) {
  const role = input.role ?? "MEMBER";
  const status = input.memberStatus ?? "ACTIVE";
  const units = input.units ?? [{ id: "business-a", status: "ACTIVE" }];
  const tx = {
    membership: { findUnique: vi.fn().mockResolvedValue({ status, role }) },
    chessBusinessUnit: { findMany: vi.fn().mockResolvedValue(units) },
    chessEmployeeAssignment: { findUnique: vi.fn().mockResolvedValue(
      input.assigned === false ? null : { revokedAt: input.revoked ? new Date() : null }
    ) },
    chessSecurityEvent: { create: vi.fn().mockResolvedValue({ id: "event" }) },
  };
  const db = { $transaction: vi.fn(async (callback:(value:unknown)=>Promise<unknown>)=>callback(tx)) };
  return {tx,db};
}
describe("Round 55 legacy lead multi-business and mutation audit", () => {
  it("requires live active member, assignment and limited owner role", async () => {
    const base = context();
    expect((await liveLegacyLeadActor(base.tx as never, "user-a", "record:read")).businessId)
      .toBe("business-a");
    for (const input of [
      { memberStatus: "SUSPENDED" }, { assigned: false }, { revoked: true },
      { role: "VIEWER" as const },
      { units: [{id:"business-a",status:"INACTIVE"}] },
      { units: [{id:"business-a",status:"ACTIVE"},{id:"business-b",status:"ACTIVE"}] },
      { units: [{id:"business-a",status:"ACTIVE"},{id:"business-b",status:"INACTIVE"}] },
    ]) {
      const denied = context(input);
      await expect(liveLegacyLeadActor(denied.tx as never, "user-a", "record:read"))
        .rejects.toBeInstanceOf(PermissionError);
    }
  });
  it("rejects MEMBER update of a different owner; supports admin explicit scope", async () => {
    const member = context();
    await expect(liveLegacyLeadActor(member.tx as never, "user-a",
      "record:update", "user-b")).rejects.toBeInstanceOf(PermissionError);
    const mine = await liveLegacyLeadActor(member.tx as never, "user-a",
      "record:update", "user-a");
    expect(legacyOwnerFilter(mine)).toEqual({ownerUserId:"user-a"});
    const admin = context({role:"ADMIN"});
    expect(legacyOwnerFilter(await liveLegacyLeadActor(admin.tx as never,
      "user-a","record:update","user-b"))).toEqual({});
  });
  it("commits read/write response only when the security event insertion succeeds", async () => {
    const {db,tx}=context({role:"OWNER"});
    expect(await withAuditedLegacyLeadMutation(db as never,"user-a","record:update",
      "TEST_UPDATE","lead-a", async () => ({id:"lead-a"}))).toEqual({id:"lead-a"});
    expect(tx.chessSecurityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId:"business-a",actorClerkUserId:"user-a",
        action:"TEST_UPDATE",resourceId:"lead-a",decision:"ALLOW",
      }),
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),
      expect.objectContaining({isolationLevel:"Serializable"}));
    tx.chessSecurityEvent.create.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(withAuditedLegacyLeadRead(db as never,"user-a",
      "TEST_READ","lead-a",async()=>({email:"private@example.test"})))
      .rejects.toThrow("audit unavailable");
  });
});
