import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userId: null as string | null,
  membership: null as null | { clerkUserId: string; role: string; email: string | null; displayName: string | null; status: string },
  failDb: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: mocks.userId }),
}));
vi.mock("@/lib/db/get-tenant-db", () => ({
  getTenantDb: () => {
    if (mocks.failDb) throw new Error("Tenant unavailable");
    return { db: { membership: { findUnique: async () => mocks.membership } } };
  },
}));

import { requirePermission, PermissionError } from "./require-permission";
import { can } from "./permissions";

describe("tenant CRM permissions", () => {
  beforeEach(() => {
    mocks.userId = null;
    mocks.membership = null;
    mocks.failDb = false;
  });

  it("denies unauthenticated actions instead of default allowing", async () => {
    await expect(requirePermission("record:read")).rejects.toBeInstanceOf(PermissionError);
  });

  it("denies a logged-in user without tenant membership", async () => {
    mocks.userId = "user-1";
    await expect(requirePermission("record:create")).rejects.toBeInstanceOf(PermissionError);
  });

  it("denies access when tenant resolution fails", async () => {
    mocks.userId = "user-1";
    mocks.failDb = true;
    await expect(requirePermission("record:read")).rejects.toBeInstanceOf(PermissionError);
  });

  for (const status of ["INVITED", "SUSPENDED"] as const) {
    it(`denies ${status.toLowerCase()} memberships`, async () => {
      mocks.userId = "user-1";
      mocks.membership = { clerkUserId: "user-1", role: "ADMIN", email: null, displayName: null, status };
      await expect(requirePermission("record:read")).rejects.toBeInstanceOf(PermissionError);
    });
  }

  it("permits an active owner", async () => {
    mocks.userId = "user-1";
    mocks.membership = { clerkUserId: "user-1", role: "OWNER", email: null, displayName: null, status: "ACTIVE" };
    await expect(requirePermission("record:delete")).resolves.toBeUndefined();
  });

  it("restricts member updates to records they own", async () => {
    mocks.userId = "user-1";
    mocks.membership = { clerkUserId: "user-1", role: "MEMBER", email: null, displayName: null, status: "ACTIVE" };
    await expect(requirePermission("record:update")).rejects.toBeInstanceOf(PermissionError);
    await expect(requirePermission("record:update", { ownsRecord: false })).rejects.toBeInstanceOf(PermissionError);
    await expect(requirePermission("record:update", { ownsRecord: true })).resolves.toBeUndefined();
    await expect(requirePermission("record:delete", { ownsRecord: true })).rejects.toBeInstanceOf(PermissionError);
  });

  it("rejects unknown roles without throwing an internal error", () => {
    expect(can("UNKNOWN" as never, "record:read")).toBe(false);
  });
});
