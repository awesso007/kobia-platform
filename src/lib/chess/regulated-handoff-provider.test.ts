import {afterEach,describe,expect,it,vi} from "vitest";
import {regulatedHandoffConfigured,submitRegulatedHandoff,
 lookupRegulatedHandoff} from "./regulated-handoff-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function config(){
 vi.stubEnv("CHESS_REGULATED_HANDOFF_ENABLED","true");
 vi.stubEnv("CHESS_AFFILIATION_VERIFICATION_ENABLED","true");
 vi.stubEnv("CHESS_LICENSE_SOURCE_HOSTS","official.test.gov");
 vi.stubEnv("CHESS_AFFILIATION_SOURCE_HOSTS","official.test.gov");
 vi.stubEnv("CHESS_REGULATED_HANDOFF_API_URL","https://partner.example.test/create");
 vi.stubEnv("CHESS_REGULATED_STATUS_API_URL","https://partner.example.test/status");
 vi.stubEnv("CHESS_REGULATED_ALLOWED_HOST","partner.example.test");
 vi.stubEnv("CHESS_REGULATED_API_KEY","sandbox");
 vi.stubEnv("CHESS_REGULATED_PARTNER_MORTGAGE","licensed_partner_test");
}
const handoff={tenantSlug:"test",businessId:"unit",serviceCaseId:"case",
 workflowId:"workflow",service:"MORTGAGE" as const,
 kind:"MORTGAGE_DOCUMENT_INTAKE" as const,idempotencyKey:"digest",
 partnerId:"licensed_partner_test"};
describe("M6 regulated coordination handoff safety",()=>{
 it("is disabled by default and rejects bad gateway URLs",()=>{
  config();
  vi.stubEnv("CHESS_REGULATED_HANDOFF_ENABLED","false");
  expect(regulatedHandoffConfigured("MORTGAGE")).toBe(false);
  vi.stubEnv("CHESS_REGULATED_HANDOFF_ENABLED","true");
  expect(regulatedHandoffConfigured("MORTGAGE")).toBe(true);
  expect(regulatedHandoffConfigured("INSURANCE")).toBe(false);
  vi.stubEnv("CHESS_REGULATED_STATUS_API_URL","http://partner.example.test/status");
  expect(regulatedHandoffConfigured("MORTGAGE")).toBe(false);
 });
 it("sends only opaque case references and private partner id",async()=>{
  config();
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   id:"provider-ref",status:"accepted",workflowId:"workflow",
  })});
  vi.stubGlobal("fetch",http);
  const result=await submitRegulatedHandoff(handoff);
  expect(result.status).toBe("accepted");
  const [url,options]=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://partner.example.test/create");
  const body=JSON.parse(String(options.body));
  expect(Object.keys(body).sort()).toEqual(Object.keys(handoff).sort());
  expect(body).not.toHaveProperty("socialSecurityNumber");
  expect(body).not.toHaveProperty("income");
  expect(body).not.toHaveProperty("healthHistory");
  expect(body).not.toHaveProperty("tradeOrder");
  expect((options.headers as Record<string,string>)["Idempotency-Key"]).toBe("digest");
 });
 it("rejects a wrong workflow and unknown remote status",async()=>{
  config();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   id:"ref",status:"accepted",workflowId:"wrong-workflow",
  })}));
  await expect(submitRegulatedHandoff(handoff)).rejects.toThrow();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   id:"wrong-provider-ref",status:"accepted",workflowId:"workflow",
  })}));
  await expect(lookupRegulatedHandoff({
   tenantSlug:"test",businessId:"unit",serviceCaseId:"case",
   workflowId:"workflow",service:"MORTGAGE",idempotencyKey:"digest",
   providerRequestId:"expected-id",
  })).rejects.toThrow();
 });
});
