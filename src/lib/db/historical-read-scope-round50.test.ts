import { describe, expect, it } from "vitest";
import {
  HistoricalReadScopeError, scopedHistoricalTenantClient, withHistoricalTenantReadScope,
} from "./historical-read-scope";

describe("Round 50 tenant-local historical read transaction binding", () => {
  const txA={membership:{findUnique:async()=>({status:"ACTIVE"})}};
  const txB={membership:{findUnique:async()=>({status:"SUSPENDED"})}};

  it("returns only the exact tenant's transaction client and tracks use",async()=>{
    await withHistoricalTenantReadScope({
      tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx:txA as never,
    },async scope=>{
      expect(scopedHistoricalTenantClient("chess-demo","tenant_chess_demo")).toBe(txA);
      expect(scopedHistoricalTenantClient(null,"tenant_chess_demo")).toBe(txA);
      expect(scope.accesses).toBe(2);
      expect(()=>scopedHistoricalTenantClient("other","tenant_chess_demo")).toThrow(HistoricalReadScopeError);
      expect(()=>scopedHistoricalTenantClient(null,"tenant_other")).toThrow(HistoricalReadScopeError);
    });
    expect(scopedHistoricalTenantClient("chess-demo","tenant_chess_demo")).toBeNull();
  });

  it("isolates concurrent tenants and rejects reentrant read transaction",async()=>{
    await Promise.all([
      withHistoricalTenantReadScope({
        tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx:txA as never,
      },async()=>{
        await Promise.resolve();
        expect(scopedHistoricalTenantClient(null,"tenant_chess_demo")).toBe(txA);
        await expect(withHistoricalTenantReadScope({
          tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx:txA as never,
        },async()=>true)).rejects.toThrow("nested");
      }),
      withHistoricalTenantReadScope({
        tenantId:"other",schemaName:"tenant_other",tx:txB as never,
      },async()=>{
        expect(scopedHistoricalTenantClient(null,"tenant_other")).toBe(txB);
        expect(()=>scopedHistoricalTenantClient(null,"tenant_chess_demo")).toThrow();
      }),
    ]);
  });

  it("denies escaped callbacks after transaction closes and invalid schemas",async()=>{
    let leaked:()=>unknown=()=>null;
    await withHistoricalTenantReadScope({
      tenantId:"chess-demo",schemaName:"tenant_chess_demo",tx:txA as never,
    },async()=>{
      leaked=()=>scopedHistoricalTenantClient("chess-demo","tenant_chess_demo");
    });
    // Closed scope is still visible to detached async callbacks; they fail,
    // rather than reacquiring the original Prisma client.
    expect(scopedHistoricalTenantClient("chess-demo","tenant_chess_demo")).toBeNull();
    expect(leaked()).toBeNull();
    await expect(withHistoricalTenantReadScope({
      tenantId:"chess-demo",schemaName:"tenant_other",tx:txA as never,
    },async()=>true)).rejects.toThrow();
  });
});
