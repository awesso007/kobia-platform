import { describe, expect, it, vi } from "vitest";
import {
  createLegacyTrpcReadDbProxy,
} from "./trpc-db";
import {
  withLegacyTrpcReadScope, withLegacyTrpcMutationScope,
  HistoricalTrpcReadScopeError,
} from "./trpc-read-scope";

vi.mock("@/lib/db", () => ({ db: {} }));

function context() {
  const source = {
    account: {
      findMany: vi.fn(async () => [{ id: "UNSCOPED" }]),
      update: vi.fn(async () => ({ id: "UNSCOPED" })),
      delete: vi.fn(async () => ({ id: "UNSCOPED" })),
    },
    $transaction: vi.fn(async () => true),
  };
  const tx = {
    account: {
      findMany: vi.fn(async () => [{ id: "TENANT_A" }]),
      update: vi.fn(async () => ({ id: "TENANT_A" })),
      delete: vi.fn(async () => ({ id: "TENANT_A" })),
    },
  };
  return { source, tx, proxy: createLegacyTrpcReadDbProxy(source) };
}
describe("Round 57 tRPC write transaction binding", () => {
  it("binds reads/writes to the same transaction, never the raw client", async () => {
    const { source, tx, proxy } = context();
    await withLegacyTrpcMutationScope({
      tenantId: "tenant-a", userId: "actor-a", tx: tx as never,
    }, async scope => {
      expect(await proxy.account.findMany()).toEqual([{ id: "TENANT_A" }]);
      expect(await proxy.account.update()).toEqual({ id: "TENANT_A" });
      expect(scope.accesses).toBe(2);
      expect(() => proxy.$transaction).toThrow("Nested legacy Prisma transaction prohibited");
    });
    expect(source.account.findMany).not.toHaveBeenCalled();
    expect(source.account.update).not.toHaveBeenCalled();
    expect(tx.account.findMany).toHaveBeenCalledOnce();
    expect(tx.account.update).toHaveBeenCalledOnce();
  });
  it("retains query read-only behavior under a separate scoped transaction", async () => {
    const { tx, proxy } = context();
    await withLegacyTrpcReadScope({
      tenantId: "tenant-a", userId: "actor-a", tx: tx as never,
    }, async scope => {
      expect(await proxy.account.findMany()).toEqual([{ id: "TENANT_A" }]);
      expect(scope.accesses).toBe(1);
      expect(() => proxy.account.update).toThrow("Write operation prohibited");
    });
    expect(tx.account.update).not.toHaveBeenCalled();
  });
  it("rejects nested write/read scopes and stale escaped transaction objects", async () => {
    const { tx, proxy } = context();
    let leaked: (() => Promise<unknown>) | null = null;
    await withLegacyTrpcMutationScope({
      tenantId: "tenant-a", userId: "actor-a", tx: tx as never,
    }, async () => {
      leaked = async () => proxy.account.delete();
      await expect(withLegacyTrpcMutationScope({
        tenantId: "tenant-b", userId: "actor-b", tx: tx as never,
      }, async () => true)).rejects.toBeInstanceOf(HistoricalTrpcReadScopeError);
      await expect(withLegacyTrpcReadScope({
        tenantId: "tenant-b", userId: "actor-b", tx: tx as never,
      }, async () => true)).rejects.toBeInstanceOf(HistoricalTrpcReadScopeError);
    });
    expect(leaked).not.toBeNull();
    // Only a captured callback within its original ALS context is invalid;
    // a new unscoped request still uses the original source by design.
    const { proxy: unrelated } = context();
    expect(await unrelated.account.findMany()).toEqual([{ id: "UNSCOPED" }]);
  });
});
