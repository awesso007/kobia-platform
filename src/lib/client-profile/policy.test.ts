import { describe, expect, it } from "vitest";
import { canAccessService, canReadClientProfile, canWriteClientProfile } from "./policy";
import type { ProfileActor, ServiceGrant } from "./policy";

const owner: ProfileActor = { clerkUserId: "owner", role: "OWNER", status: "ACTIVE" };
const member: ProfileActor = { clerkUserId: "staff", role: "MEMBER", status: "ACTIVE" };
const suspended: ProfileActor = { ...owner, status: "SUSPENDED" };
const grant: ServiceGrant = {
  clerkUserId: "staff", service: "MORTGAGE", canRead: true, canWrite: false,
};

describe("Unified Client Profile security", () => {
  it("denies missing and suspended identities", () => {
    expect(canReadClientProfile(null, "staff")).toBe(false);
    expect(canReadClientProfile(suspended, "owner")).toBe(false);
    expect(canAccessService(null, "TAX", [], "read")).toBe(false);
  });

  it("limits general profile access to admins and assigned staff", () => {
    expect(canReadClientProfile(owner, null)).toBe(true);
    expect(canReadClientProfile(member, "staff")).toBe(true);
    expect(canReadClientProfile(member, "someone-else")).toBe(false);
    expect(canWriteClientProfile({ ...member, role: "VIEWER" }, "staff")).toBe(false);
  });

  it("does not give an owner blanket access to sensitive services", () => {
    expect(canAccessService(owner, "MORTGAGE", [grant], "read")).toBe(false);
    expect(canAccessService(member, "TAX", [grant], "read")).toBe(false);
    expect(canAccessService(member, "MORTGAGE", [grant], "read")).toBe(true);
    expect(canAccessService(member, "MORTGAGE", [grant], "write")).toBe(false);
  });

  it("denies revoked, suspended, and viewer access", () => {
    expect(canAccessService(member, "MORTGAGE", [{ ...grant, revokedAt: new Date() }], "read")).toBe(false);
    expect(canAccessService({ ...member, status: "SUSPENDED" }, "MORTGAGE", [grant], "read")).toBe(false);
    expect(canAccessService({ ...member, role: "VIEWER" }, "MORTGAGE", [grant], "read")).toBe(false);
  });
});
