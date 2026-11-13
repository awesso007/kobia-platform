import {describe,it,expect} from "vitest";
import {bankTransactionFingerprint} from "./bank-review";
describe("M5 immutable bank transaction review snapshot",()=>{
 const base={id:"bank-transaction",bankAccountId:"bank-account",dedupHash:"import-hash",
  postedDate:new Date("2026-10-31T00:00:00Z"),amountCents:-12500n,status:"UNMATCHED"};
 it("binds the review to tenant, entity, account, date, amount and status",()=>{
  const first=bankTransactionFingerprint(base,"tenant-a","entity-a");
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(first).toBe(bankTransactionFingerprint({...base},"tenant-a","entity-a"));
  expect(first).not.toBe(bankTransactionFingerprint({...base,amountCents:-12501n},"tenant-a","entity-a"));
  expect(first).not.toBe(bankTransactionFingerprint({...base,status:"MATCHED"},"tenant-a","entity-a"));
  expect(first).not.toBe(bankTransactionFingerprint({...base},"tenant-b","entity-a"));
  expect(first).not.toBe(bankTransactionFingerprint({...base},"tenant-a","entity-b"));
 });
});
