import {describe,expect,it} from "vitest";
import {classifyLegacyChessPosting} from "./bank-ledger-reconcile";
const match={transaction:{status:"CATEGORIZED",
 categorizedJournalEntryId:"je",amountCents:3500n,bankGlAccountId:"bank"},
 journals:[{id:"je",status:"POSTED",reversalOfId:null,reversedById:null,
  lines:[{accountId:"bank",debitCents:3500n,creditCents:0n},
   {accountId:"revenue",debitCents:0n,creditCents:3500n}]}]};
describe("M5 read-only cross-DB bank ledger evidence check",()=>{
 it("accepts only an exact, balanced two-line posted journal linked to the bank row",()=>{
  expect(classifyLegacyChessPosting(match)).toBe("MATCHED_POSTED");
  expect(classifyLegacyChessPosting({...match,transaction:{...match.transaction,
   categorizedJournalEntryId:null}})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,journals:[
   {...match.journals[0]!,status:"DRAFT"}]})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,journals:[
   {...match.journals[0]!,reversedById:"reversal"}]})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,journals:[
   {...match.journals[0]!,lines:[...match.journals[0]!.lines,
    {accountId:"extra",debitCents:0n,creditCents:0n}]}]})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,journals:[
   {...match.journals[0]!,lines:match.journals[0]!.lines.map((x,i)=>({
    ...x,accountId:i===0?"other":x.accountId,
   }))}]})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,journals:[
   {...match.journals[0]!,lines:[
    {...match.journals[0]!.lines[0]!,debitCents:3501n},
    match.journals[0]!.lines[1]!,
   ]}]})).toBe("DIVERGED");
 });
 it("distinguishes clean absence from mismatched or unknown ledger evidence",()=>{
  expect(classifyLegacyChessPosting({transaction:{
   status:"UNMATCHED",categorizedJournalEntryId:null,
   amountCents:120n,bankGlAccountId:"bank"},journals:[]})).toBe("UNPOSTED");
  expect(classifyLegacyChessPosting({transaction:null,journals:[]})).toBe("UNKNOWN");
  expect(classifyLegacyChessPosting({...match,journals:[
   match.journals[0]!,match.journals[0]!,
  ]})).toBe("DIVERGED");
  expect(classifyLegacyChessPosting({...match,transaction:{
   ...match.transaction,status:"UNMATCHED",
  }})).toBe("DIVERGED");
 });
});
