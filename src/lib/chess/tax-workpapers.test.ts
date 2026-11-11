import {describe,it,expect} from "vitest";
import {isBalancedTaxSnapshot,taxSnapshotDigest,taxReviewSeparation} from "./tax-workpapers";
describe("M5 tax workpaper evidence",()=>{
 const row={id:"je-1",entryDate:new Date("2026-10-31T00:00:00Z"),
  postedAt:new Date("2026-11-01T00:00:00Z"),lines:[
   {accountId:"debit",debitCents:30000n,creditCents:0n},
   {accountId:"credit",debitCents:0n,creditCents:30000n},
  ]};
 it("requires balanced posted ledger lines",()=>{
  expect(isBalancedTaxSnapshot([row])).toBe(true);
  expect(isBalancedTaxSnapshot([{...row,lines:[row.lines[0]]}])).toBe(false);
  expect(isBalancedTaxSnapshot([{...row,lines:[
   {...row.lines[0],debitCents:30001n},row.lines[1],
  ]}])).toBe(false);
 });
 it("changes the snapshot digest when an accounting amount changes",()=>{
  const hash=taxSnapshotDigest([row],"tenant","entity",new Date("2026-01-01Z"),new Date("2027-01-01Z"));
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  const altered={...row,lines:[{...row.lines[0],debitCents:30001n},row.lines[1]]};
  expect(hash).not.toBe(taxSnapshotDigest([altered],"tenant","entity",new Date("2026-01-01Z"),new Date("2027-01-01Z")));
 });
 it("requires distinct human creator, reviewer and final approver",()=>{
  const draft={status:"DRAFT",createdByClerkUserId:"creator",reviewedByClerkUserId:null};
  expect(taxReviewSeparation(draft,"reviewer","MEMBER","REVIEWED")).toBe(true);
  expect(taxReviewSeparation(draft,"creator","ADMIN","REVIEWED")).toBe(false);
  const reviewed={...draft,status:"REVIEWED",reviewedByClerkUserId:"reviewer"};
  expect(taxReviewSeparation(reviewed,"reviewer","ADMIN","APPROVED")).toBe(false);
  expect(taxReviewSeparation(reviewed,"approver","MEMBER","APPROVED")).toBe(false);
  expect(taxReviewSeparation(reviewed,"approver","ADMIN","APPROVED")).toBe(true);
 });
});
