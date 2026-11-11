import {afterEach,describe,expect,it,vi} from "vitest";
import {billingProviderConfigured,deliverChessInvoice,
 checkChessInvoiceStatus} from "./billing-provider";
import {canApproveInvoice,canSendApprovedInvoice,invoiceDeliveryState,invoiceDigest} from "./billing";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
function configure(){
 vi.stubEnv("CHESS_BILLING_DELIVERY_ENABLED","true");
 vi.stubEnv("CHESS_BILLING_VENDOR_CERTIFIED","true");
 vi.stubEnv("CHESS_BILLING_ALLOWED_HOST","billing.test.example");
 vi.stubEnv("CHESS_BILLING_DELIVERY_API_URL","https://billing.test.example/create");
 vi.stubEnv("CHESS_BILLING_STATUS_API_URL","https://billing.test.example/status");
 vi.stubEnv("CHESS_BILLING_API_KEY","test-token");
}
const invoice={tenantSlug:"tenant",businessId:"business",clientProfileId:"client",
 serviceCaseId:"case",invoiceId:"invoice",service:"BOOKKEEPING",
 descriptionCode:"BOOKKEEPING_MONTHLY",currency:"USD" as const,
 amountCents:"10000",idempotencyKey:"digest"};
describe("M7 invoice delivery and approval boundaries",()=>{
 it("requires independent human approval and never treats acceptance as payment",()=>{
  expect(canApproveInvoice("creator","creator","ADMIN")).toBe(false);
  expect(canApproveInvoice("creator","reviewer","MEMBER")).toBe(false);
  expect(canApproveInvoice("creator","reviewer","ADMIN")).toBe(true);
  expect(invoiceDeliveryState("accepted")).toBe("SENT");
  expect(invoiceDeliveryState("pending")).toBe("UNKNOWN");
  expect(invoiceDeliveryState("not_found")).toBe("UNKNOWN");
  expect(invoiceDeliveryState("rejected")).toBe("REJECTED");
 });
 it("requires three different active roles in invoice author, approver and sender sequence",()=>{
  const invoice={createdByClerkUserId:"creator",approvedByClerkUserId:"reviewer"};
  expect(canSendApprovedInvoice(invoice,"creator")).toBe(false);
  expect(canSendApprovedInvoice(invoice,"reviewer")).toBe(false);
  expect(canSendApprovedInvoice(invoice,"independent-sender")).toBe(true);
  expect(canSendApprovedInvoice({...invoice,approvedByClerkUserId:"creator"},
   "independent-sender")).toBe(false);
  expect(canSendApprovedInvoice({...invoice,approvedByClerkUserId:null},
   "independent-sender")).toBe(false);
 });
 it("uses content-bound, tenant-isolated invoice fingerprints",()=>{
  const src={tenantSlug:"tenant",businessId:"business",
   clientProfileId:"client",serviceCaseId:"case",service:"BOOKKEEPING",
   descriptionCode:"BOOKKEEPING_MONTHLY",amountCents:"10000",requestKey:"key"};
  const digest=invoiceDigest(src);
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(digest).not.toBe(invoiceDigest({...src,amountCents:"10001"}));
  expect(digest).not.toBe(invoiceDigest({...src,tenantSlug:"other"}));
 });
 it("fails closed until both delivery and read-only status gateways are allowed",()=>{
  configure();
  expect(billingProviderConfigured()).toBe(true);
  vi.stubEnv("CHESS_BILLING_STATUS_API_URL","https://evil.invalid/status");
  expect(billingProviderConfigured()).toBe(false);
  vi.stubEnv("CHESS_BILLING_DELIVERY_ENABLED","false");
  expect(billingProviderConfigured()).toBe(false);
 });
 it("only sends opaque invoice IDs and a dollar amount, never bank/card instructions",async()=>{
  configure();
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   invoiceId:"invoice",id:"remote-invoice",status:"accepted",
  })});
  vi.stubGlobal("fetch",http);
  const result=await deliverChessInvoice(invoice);
  expect(result.id).toBe("remote-invoice");
  const [url,options]=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://billing.test.example/create");
  expect(JSON.parse(String(options.body))).toEqual(invoice);
  expect(String(options.body)).not.toContain("cardNumber");
  expect(String(options.body)).not.toContain("bankRoutingNumber");
  expect((options.headers as Record<string,string>)["Idempotency-Key"]).toBe("digest");
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({
   invoiceId:"different-invoice",id:"remote-invoice",status:"accepted",
  })}));
  await expect(checkChessInvoiceStatus({
   tenantSlug:"tenant",businessId:"business",invoiceId:"invoice",
   idempotencyKey:"digest",providerInvoiceId:"remote-invoice",
  })).rejects.toThrow();
 });
});
