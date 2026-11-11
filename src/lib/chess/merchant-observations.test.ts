import {afterEach,describe,expect,it,vi} from "vitest";
import {createHmac} from "node:crypto";
import {merchantWebhookConfigured,verifyMerchantWebhookSignature,
 merchantObservationSchema,merchantObservationDigest} from "./merchant-observations";
afterEach(()=>vi.unstubAllEnvs());
describe("M7 merchant observation signature and privacy boundary",()=>{
 const setup=()=>{
  vi.stubEnv("CHESS_MERCHANT_WEBHOOK_ENABLED","true");
  vi.stubEnv("CHESS_MERCHANT_VENDOR_CERTIFIED","true");
  vi.stubEnv("CHESS_MERCHANT_SETTLEMENT_POLICY_APPROVED","true");
  vi.stubEnv("CHESS_MERCHANT_PROVIDER_ID","fictional_provider");
  vi.stubEnv("CHESS_MERCHANT_WEBHOOK_HMAC_KEY","x".repeat(40));
 };
 const signed=(raw:string,tenant:string,timestamp:string)=>
  createHmac("sha256","x".repeat(40)).update(
   tenant+"."+timestamp+"."+raw).digest("hex");
 it("rejects disabled vendor flags and accepts only verified-bound event",()=>{
  setup();
  const now=Date.parse("2026-11-11T12:00:00.000Z");
  const stamp=String(now),raw='{"reference":"opaque"}';
  const signature=signed(raw,"tenant-a",stamp);
  expect(merchantWebhookConfigured()).toBe(true);
  expect(verifyMerchantWebhookSignature(raw,"tenant-a",stamp,signature,now)).toBe(true);
  expect(verifyMerchantWebhookSignature(raw,"tenant-b",stamp,signature,now)).toBe(false);
  expect(verifyMerchantWebhookSignature(raw,"tenant-a",stamp,signature,now+300001)).toBe(false);
  expect(verifyMerchantWebhookSignature(raw+"X","tenant-a",stamp,signature,now)).toBe(false);
  vi.stubEnv("CHESS_MERCHANT_VENDOR_CERTIFIED","false");
  expect(verifyMerchantWebhookSignature(raw,"tenant-a",stamp,signature,now)).toBe(false);
 });
 it("rejects extra payload fields and unbound currency",()=>{
  const payload={
   tenantSlug:"tenant-a",providerId:"fictional_provider",
   businessId:"unit-a",invoiceId:"invoice-a",providerInvoiceId:"inv_remote",
   providerEventId:"evt_opaque_001",eventKind:"PAYMENT_CAPTURED",
   amountCents:"12000",currency:"USD",
   occurredAt:"2026-11-11T12:00:00.000Z",
  };
  expect(merchantObservationSchema.parse(payload).amountCents).toBe("12000");
  expect(()=>merchantObservationSchema.parse({...payload,cardNumber:"4111"})).toThrow();
  expect(()=>merchantObservationSchema.parse({...payload,currency:"EUR"})).toThrow();
  expect(()=>merchantObservationSchema.parse({...payload,amountCents:"-1"})).toThrow();
  const digest=merchantObservationDigest("tenant-a",JSON.stringify(payload));
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(digest).not.toBe(merchantObservationDigest("tenant-b",JSON.stringify(payload)));
 });
});
