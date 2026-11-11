import {afterEach,describe,expect,it,vi} from "vitest";
import {bankFeedImportConfigured,feedDedupHash,validateBankFeed,fetchChessBankFeed}
 from "./bank-feed-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("M5 bank feed safety contract",()=>{
 const since=new Date("2026-11-01T00:00:00.000Z");
 const now=new Date("2026-11-10T00:00:00.000Z");
 const item={externalId:"provider-id-1",postedDate:"2026-11-02T00:00:00.000Z",
  amountCents:"-5250",description:"General office purchase",
  currency:"USD" as const,pending:false as const};
 it("rejects truncated pages, pending charges and duplicate external IDs",()=>{
  expect(validateBankFeed({transactions:[item],truncated:false},since,now)).toHaveLength(1);
  expect(()=>validateBankFeed({transactions:[item],truncated:true},since,now)).toThrow();
  expect(()=>validateBankFeed({transactions:[{...item,pending:true}],
   truncated:false},since,now)).toThrow();
  expect(()=>validateBankFeed({transactions:[item,item],
   truncated:false},since,now)).toThrow();
 });
 it("hashes external IDs into tenant-and-bank-scoped deduplication keys",()=>{
  const digest=feedDedupHash("tenant","account","provider-id-1");
  expect(digest).toMatch(/^[0-9a-f]{64}$/);
  expect(digest).not.toBe(feedDedupHash("tenant","other","provider-id-1"));
  expect(digest).not.toBe(feedDedupHash("other","account","provider-id-1"));
 });
 it("requires explicit source and independent import activation",()=>{
  vi.stubEnv("CHESS_BANK_FEED_API_URL","https://feed.test.example/transactions");
  vi.stubEnv("CHESS_BANK_FEED_ALLOWED_HOST","feed.test.example");
  vi.stubEnv("CHESS_BANK_FEED_API_KEY","sandbox");
  vi.stubEnv("CHESS_BANK_FEED_SOURCE","PLAID");
  vi.stubEnv("CHESS_BANK_FEED_ENABLED","true");
  vi.stubEnv("CHESS_BANK_FEED_IMPORT_ENABLED","false");
  expect(bankFeedImportConfigured()).toBe(false);
  vi.stubEnv("CHESS_BANK_FEED_IMPORT_ENABLED","true");
  expect(bankFeedImportConfigured()).toBe(true);
  vi.stubEnv("CHESS_BANK_FEED_API_URL","http://feed.test.example/transactions");
  expect(bankFeedImportConfigured()).toBe(false);
 });
 it("imports from an approved gateway without transmitting bank account numbers",async()=>{
  vi.stubEnv("CHESS_BANK_FEED_API_URL","https://feed.test.example/transactions");
  vi.stubEnv("CHESS_BANK_FEED_ALLOWED_HOST","feed.test.example");
  vi.stubEnv("CHESS_BANK_FEED_API_KEY","sandbox");
  vi.stubEnv("CHESS_BANK_FEED_SOURCE","PLAID");
  vi.stubEnv("CHESS_BANK_FEED_ENABLED","true");
  vi.stubEnv("CHESS_BANK_FEED_IMPORT_ENABLED","true");
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   transactions:[item],truncated:false,
  })});
  vi.stubGlobal("fetch",http);
  await expect(fetchChessBankFeed("external_opaque_bank",since))
   .resolves.toHaveLength(1);
  const args=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(args[0]).toBe("https://feed.test.example/transactions");
  const sent=JSON.parse(String(args[1].body));
  expect(sent.providerAccountRef).toBe("external_opaque_bank");
  expect(sent.includePending).toBe(false);
  expect(sent).not.toHaveProperty("accountNumber");
 });
});
