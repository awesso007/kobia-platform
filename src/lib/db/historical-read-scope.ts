/**
 * Request-only read-transaction binding for the legacy schema-per-tenant API.
 *
 * Prisma transaction clients are not full PrismaClients. Existing legacy
 * query functions accept PrismaClient, so only the transaction lifetime may
 * expose an intentionally typed cast. Never use this scope for mutations.
 *
 * The AsyncLocalStorage context is a per-request TRANSACTION, not a global
 * authorization flag. Tenant/schema mismatches and escaped async callbacks
 * always throw. No file content, emails or sensitive payloads are logged.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@/lib/db/generated/tenant";

export class HistoricalReadScopeError extends Error {
  constructor(message = "Historical read scope unavailable") {
    super(message);
    this.name = "HistoricalReadScopeError";
  }
}
export type HistoricalTenantReadScope = {
  readonly tenantId: string;
  readonly schemaName: string;
  readonly tx: Prisma.TransactionClient;
  accesses: number;
  closed: boolean;
};
const storage = new AsyncLocalStorage<HistoricalTenantReadScope>();
const VALID_SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;

export function scopedHistoricalTenantClient(
  tenantId: string | null, schemaName: string,
): PrismaClient | null {
  const scope = storage.getStore();
  if (!scope) return null;
  if (scope.closed || scope.schemaName !== schemaName ||
      (tenantId !== null && scope.tenantId !== tenantId)) {
    throw new HistoricalReadScopeError("Tenant/schema changed during audited read");
  }
  scope.accesses += 1;
  return scope.tx as unknown as PrismaClient;
}

export async function withHistoricalTenantReadScope<T>(
  input: { tenantId: string; schemaName: string; tx: Prisma.TransactionClient },
  run: (scope: HistoricalTenantReadScope) => Promise<T>,
): Promise<T> {
  if (!VALID_SLUG.test(input.tenantId) ||
      input.schemaName !== "tenant_" + input.tenantId.replace(/-/g, "_") ||
      storage.getStore()) {
    throw new HistoricalReadScopeError("Invalid or nested historical read transaction");
  }
  const scope: HistoricalTenantReadScope = { ...input, accesses: 0, closed: false };
  return storage.run(scope, async () => {
    try { return await run(scope); }
    finally { scope.closed = true; }
  });
}


/**
 * Round 57: a separate write-scoped operation that binds authenticated
 * historical API mutation handlers to ONE tenant PostgreSQL transaction.
 * Scope cannot nest or change tenant; all existing getTenantDb() reads/writes
 * by the handler resolve to the exact same transaction client as its audit.
 * External providers must NOT be invoked before the commit; those routes
 * require a durable outbox and are not eligible for this adapter.
 */
export async function withHistoricalTenantWriteScope<T>(
 input:{tenantId:string;schemaName:string;tx:Prisma.TransactionClient},
 run:(scope:HistoricalTenantReadScope)=>Promise<T>,
):Promise<T>{
 if(!VALID_SLUG.test(input.tenantId)||
    input.schemaName!=="tenant_"+input.tenantId.replace(/-/g,"_")||
    storage.getStore())
  throw new HistoricalReadScopeError("Invalid or nested historical write transaction");
 const scope:HistoricalTenantReadScope={...input,accesses:0,closed:false};
 return storage.run(scope,async()=>{
  try{return await run(scope)}
  finally{scope.closed=true}
 });
}
