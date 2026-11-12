import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";

function source(path:string):string{
 return readFileSync(join(process.cwd(),"src/app/api",path,"route.ts"),"utf8");
}
describe("Round 37 source inventory for high-risk historical endpoints",()=>{
 const audited=[
  ["reports/1099-nec.csv","auditedLegacyTaxExport"],
  ["reports/1099-misc.csv","auditedLegacyTaxExport"],
  ["reports/general-ledger.csv","auditedLegacyEntityExport"],
  ["reports/trial-balance.csv","auditedLegacyEntityExport"],
  ["documents/[id]/download","auditedHistoricalTenantRead"],
  ["forms2/[id]/submissions","auditedHistoricalTenantRead"],
  ["workflows/[id]/runs/[runId]","auditedHistoricalTenantRead"],
  ["mail/accounts","auditedHistoricalTenantRead"],
  ["mail/[accountId]/messages","auditedOwnedMailRead"],
  ["mail/[accountId]/threads/[threadId]","auditedOwnedMailRead"],
  ["mail/[accountId]/drafts","auditedOwnedMailRead"],
  ["files/local/[...key]","verifyLocalDownloadCapability"],
  ["share/[slug]","HISTORICAL_PUBLIC_FILE_SHARE_READ"],
 ];
 for(const [path,guard] of audited){
  it(path+" retains the selected source-level read safeguard",()=>{
   const s=source(path);
   expect(s).toContain(guard);
  });
 }
 for(const path of ["portal/login","portal/tickets","portal/tickets/[id]/reply"]){
  it("legacy unverified helpdesk "+path+" stays disabled",()=>{
   expect(source(path)).toContain("LEGACY_HELPDESK_EMAIL_ONLY_DISABLED");
  });
 }
});
