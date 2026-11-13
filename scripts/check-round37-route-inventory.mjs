/**
 * Round 37 historical KOBIA API route inventory gate.
 * Inventories route files, not their individual methods or security approval.
 * Fails when a route is added or removed without deliberately updating the
 * manifest. SOURCE_GUARDED_SUBSET is a source-marker assertion only.
 */
import {readdirSync,readFileSync,statSync} from "node:fs";
import {join} from "node:path";
const root=process.cwd();
const prefix="src/app/api";
function walk(dir){
 const out=[];
 for(const entry of readdirSync(join(root,dir))){
  const path=dir+"/"+entry;
  if(statSync(join(root,path)).isDirectory())out.push(...walk(path));
  else if(entry==="route.ts"&&!path.startsWith("src/app/api/chess/"))
   out.push(path);
 }
 return out;
}
const actual=walk(prefix).sort();
const manifest=JSON.parse(readFileSync(join(root,"docs/CHESS_CORP_2_ROUND37_HISTORICAL_ROUTES.json"),"utf8"));
const rows=manifest.routes;
const listed=rows.map(r=>r.path).sort();
const unlisted=actual.filter(path=>!listed.includes(path));
const missing=listed.filter(path=>!actual.includes(path));
if(unlisted.length||missing.length){
 throw new Error("Historical route inventory drift: added "+unlisted.join(",")+
  "; removed "+missing.join(","));
}
const allowed=new Set(["SOURCE_GUARDED_SUBSET","UNVERIFIED_SESSION_DISABLED",
 "MACHINE_CALLBACK_NEEDS_REVIEW","PUBLIC_CAPABILITY_NEEDS_REVIEW",
 "READ_PATH_REVIEW_REQUIRED"]);
const guarded={
 "reports/1099-nec.csv":"auditedLegacyTaxExport",
 "reports/1099-misc.csv":"auditedLegacyTaxExport",
 "reports/general-ledger.csv":"auditedLegacyEntityExport",
 "reports/trial-balance.csv":"auditedLegacyEntityExport",
 "documents/[id]/download":"auditedHistoricalTenantRead",
 "forms2/[id]/submissions":"auditedHistoricalTenantRead",
 "workflows/[id]/runs/[runId]":"auditedHistoricalTenantRead",
 "mail/accounts":"auditedHistoricalTenantRead",
 "mail/[accountId]/messages":"auditedOwnedMailRead",
 "mail/[accountId]/threads/[threadId]":"auditedOwnedMailRead",
 "mail/[accountId]/drafts":"auditedOwnedMailRead",
 "files/local/[...key]":"verifyLocalDownloadCapability",
 "share/[slug]":"HISTORICAL_PUBLIC_FILE_SHARE_READ",
};
for(const row of rows){
 if(!allowed.has(row.status))throw new Error("Unknown review status "+row.status);
 const path=row.path;
 if(!path.startsWith(prefix+"/"))throw new Error("Invalid API path "+path);
 const source=readFileSync(join(root,path),"utf8");
 if(row.status==="UNVERIFIED_SESSION_DISABLED"&&
  !source.includes("LEGACY_HELPDESK_EMAIL_ONLY_DISABLED"))
  throw new Error("Legacy portal deny-by-default guard missing: "+path);
 if(row.status==="SOURCE_GUARDED_SUBSET"){
  const key=path.slice(prefix.length+1,-"/route.ts".length);
  if(!guarded[key]||!source.includes(guarded[key]))
   throw new Error("Missing audited source marker: "+path);
 }
}
const counts=Object.fromEntries([...allowed].map(status=>[
 status,rows.filter(row=>row.status===status).length,
]));
console.log("Historical KOBIA API inventory:",rows.length,"route files");
console.log(JSON.stringify(counts));
console.log("WARNING: unreviewed paths and code-only guards are NOT an all-sensitive-read audit certificate.");
