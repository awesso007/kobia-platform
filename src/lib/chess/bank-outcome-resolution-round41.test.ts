import {describe,expect,it} from "vitest";
import {
 bankOutcomeResolutionEnabled,independentBankOutcomeResolver,
} from "./bank-review";
import {readFileSync} from "node:fs";

describe("Round 41 independent bank ambiguity resolution",()=>{
 const base={
  creator:"fictional-bank-suggester",reviewer:"fictional-approver",
  executor:"fictional-poster",resolver:"fictional-outcome-reviewer",
  status:"UNKNOWN",executionStartedAt:new Date("2026-11-12T00:00:00Z"),
 };
 const now=new Date("2026-11-12T01:00:00Z");
 it("defaults OFF until independently approved with two flags",()=>{
  expect(bankOutcomeResolutionEnabled({})).toBe(false);
  expect(bankOutcomeResolutionEnabled({
   CHESS_BANK_OUTCOME_RESOLUTION_ENABLED:"true"})).toBe(false);
  expect(bankOutcomeResolutionEnabled({
   CHESS_BANK_OUTCOME_POLICY_APPROVED:"true"})).toBe(false);
  expect(bankOutcomeResolutionEnabled({
   CHESS_BANK_OUTCOME_RESOLUTION_ENABLED:"true",
   CHESS_BANK_OUTCOME_POLICY_APPROVED:"true"})).toBe(true);
 });
 it("requires four separate people before pinning a missing journal receipt",()=>{
  expect(independentBankOutcomeResolver(base,now)).toBe(true);
  for(const same of [base.creator,base.reviewer,base.executor]){
   expect(independentBankOutcomeResolver({...base,resolver:same},now)).toBe(false);
  }
  expect(independentBankOutcomeResolver({...base,reviewer:null},now)).toBe(false);
  expect(independentBankOutcomeResolver({...base,status:"COMMITTED"},now)).toBe(false);
  expect(independentBankOutcomeResolver({...base,status:"FAILED"},now)).toBe(false);
  expect(independentBankOutcomeResolver({...base,status:"RESERVED"},now)).toBe(false);
 });
 it("permits only stale EXECUTING, never a recent in-flight posting",()=>{
  expect(independentBankOutcomeResolver({
   ...base,status:"EXECUTING",executionStartedAt:new Date("2026-11-12T00:45:01Z"),
  },now)).toBe(false);
  expect(independentBankOutcomeResolver({
   ...base,status:"EXECUTING",executionStartedAt:new Date("2026-11-12T00:30:00Z"),
  },now)).toBe(true);
  expect(independentBankOutcomeResolver({
   ...base,status:"EXECUTING",executionStartedAt:null,
  },now)).toBe(false);
 });
 it("only pins a proven posted journal and never calls the write adapter",()=>{
  const source=readFileSync("src/lib/chess/bank-review.ts","utf8");
  const section=source.slice(source.indexOf("export async function resolveChessApprovedBankPostingOutcome"));
  expect(section).toContain('observed.status!=="MATCHED_POSTED"');
  expect(section).toContain('status:"UNRESOLVED"');
  expect(section).not.toMatch(/commitLegacyBankClassification\s*\(/);
  expect(section).toContain('bankSettled:false,automaticallyRetried:false');
  expect(section).toContain('action:"BANK_POSTING_INDEPENDENT_RECEIPT_RECONCILED"');
 });
});
