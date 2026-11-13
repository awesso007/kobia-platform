import {describe,expect,it,vi} from "vitest";
import {createLegacyTrpcReadDbProxy} from "./trpc-db";
import {withLegacyTrpcReadScope, HistoricalTrpcReadScopeError} from "./trpc-read-scope";

vi.mock("@/lib/db",()=>({db:{}}));

describe("Round 50 legacy tRPC protected query isolation",()=>{
 const make=()=>{
  const raw={account:{findMany:vi.fn(async()=>[{id:"raw-data"}]),update:vi.fn(async()=>null)},$transaction:vi.fn(async()=>true)};
  const tx={account:{findMany:vi.fn(async()=>[{id:"tenant-a"}]),update:vi.fn(async()=>null)}};
  return {raw,tx,proxy:createLegacyTrpcReadDbProxy(raw)};
 };
 it("changes only protected query SELECT to the exact transaction client",async()=>{
  const {raw,tx,proxy}=make();
  expect(await proxy.account.findMany()).toEqual([{id:"raw-data"}]);
  await withLegacyTrpcReadScope({tenantId:"tenant-a",userId:"user-a",tx:tx as never},async scope=>{
   const records=await proxy.account.findMany();
   expect(records).toEqual([{id:"tenant-a"}]);
   expect(scope.accesses).toBe(1);
   expect(tx.account.findMany).toHaveBeenCalledOnce();
   expect(raw.account.findMany).toHaveBeenCalledOnce();
  });
 });
 it("prohibits writes and nested transactions during protected query",async()=>{
  const {raw,tx,proxy}=make();
  await withLegacyTrpcReadScope({tenantId:"tenant-a",userId:"user-a",tx:tx as never},async()=>{
   expect(()=>proxy.account.update).toThrow(HistoricalTrpcReadScopeError);
   expect(()=>proxy.$transaction).toThrow(HistoricalTrpcReadScopeError);
  });
  expect(tx.account.update).not.toHaveBeenCalled();
  expect(await proxy.$transaction()).toBe(true);
  expect(raw.$transaction).toHaveBeenCalledOnce();
 });
 it("rejects nested query scopes and concurrent cross-tenant resolution",async()=>{
  const {tx,proxy}=make();
  await Promise.all([
   withLegacyTrpcReadScope({tenantId:"tenant-a",userId:"user-a",tx:tx as never},async()=>{
    expect(await proxy.account.findMany()).toEqual([{id:"tenant-a"}]);
    await expect(withLegacyTrpcReadScope({tenantId:"tenant-a",userId:"user-b",tx:tx as never},async()=>true)).rejects.toThrow("nested");
   }),
   withLegacyTrpcReadScope({tenantId:"tenant-b",userId:"user-b",tx:tx as never},async scope=>{
    expect(await proxy.account.findMany()).toEqual([{id:"tenant-a"}]);
    expect(scope.tenantId).toBe("tenant-b");
   }),
  ]);
 });
});
