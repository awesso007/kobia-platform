import { describe, it, expect } from "vitest";
import { moduleTenantAuthorized, safeHistoricalTenantSlug, localUploadIsAuthorized, binaryMutationSameOrigin } from "./historical-mutation-boundaries";

describe("Round 49 authenticated mutation tenant and file policy", () => {
  it("rejects unknown, suspended and foreign tenant selection", () => {
    expect(safeHistoricalTenantSlug("../acme")).toBeNull();
    expect(safeHistoricalTenantSlug("chess-demo")).toBe("chess-demo");
    expect(moduleTenantAuthorized("chess-demo", {status:"ACTIVE",schemaName:"tenant_chess_demo"}, {status:"ACTIVE"})).toBe(true);
    for(const [r,m] of [
      [null,{status:"ACTIVE"}],
      [{status:"SUSPENDED",schemaName:"tenant_chess_demo"},{status:"ACTIVE"}],
      [{status:"ACTIVE",schemaName:"tenant_other"},{status:"ACTIVE"}],
      [{status:"ACTIVE",schemaName:"tenant_chess_demo"},{status:"SUSPENDED"}],
    ] as const) expect(moduleTenantAuthorized("chess-demo",r,m)).toBe(false);
  });
  it("scopes LOCAL upload to active uploader, tenant, state and exact byte count", () => {
    const base={actorUserId:"user_a",tenantSlug:"chess-demo",storageKey:"tenants/chess-demo/2026/11/uuid",
      provider:"LOCAL",status:"UPLOADING",uploadedByClerkUserId:"user_a",declaredSize:15n,actualSize:15};
    expect(localUploadIsAuthorized(base)).toBe(true);
    for(const variant of [
      {actorUserId:"user_b"},{tenantSlug:"other"},{storageKey:"tenants/chess-demo-eve/file"},
      {provider:"S3"},{status:"READY"},{uploadedByClerkUserId:null},
      {actualSize:14},{actualSize:0},{declaredSize:14n},{actualSize:30_000_000},
    ]) expect(localUploadIsAuthorized({...base,...variant})).toBe(false);
  });
  it("requires exact browser Origin, rejects cross-site and missing production configuration", () => {
    const req=(origin:string|null,site:string|null)=>({
      url:"https://test.example/api/files/local-upload",
      headers:new Headers({...origin?{origin}:{},...site?{"sec-fetch-site":site}:{}}),
    });
    expect(binaryMutationSameOrigin(req("https://test.example","same-origin"),"https://test.example",true)).toBe(true);
    expect(binaryMutationSameOrigin(req("https://other.example","cross-site"),"https://test.example",true)).toBe(false);
    expect(binaryMutationSameOrigin(req(null,null),"https://test.example",false)).toBe(false);
    expect(binaryMutationSameOrigin(req("https://test.example",null),undefined,true)).toBe(false);
  });
});
