// Black-box HTTP security smoke test against a running production Next server.
// Uses no cookies, authentication credentials or database fixtures.
const base = process.env.CHESS_SMOKE_URL || "http://127.0.0.1:3100";
const allowedDenied = new Set([301,302,303,307,308,401,403]);
async function probe(path, options, expected) {
 const response=await fetch(base+path,{...options,redirect:"manual",signal:AbortSignal.timeout(10000)});
 const body=await response.text();
 if(!expected.has(response.status)) {
  throw new Error(`${path}: expected ${[...expected].join("/")} but received ${response.status}: ${body.slice(0,200)}`);
 }
 if(body.includes("CHESS_PAYROLL_API_KEY") || body.includes("CHESS_SCAN_WORKER_TOKEN"))
  throw new Error(`${path}: secret variable name leaked in response`);
 console.log(`PASS ${path}: ${response.status}`);
}
async function main() {
 const attempts=20;
 for(let i=0;i<attempts;i++){
  try{await fetch(base+"/",{signal:AbortSignal.timeout(2500)});break;}
  catch(error){if(i===attempts-1)throw error;await new Promise(r=>setTimeout(r,1000));}
 }
 await probe("/api/chess/scan-worker?t=demo",{
  method:"POST",headers:{"Content-Type":"application/json"},body:'{"limit":1}',
 },new Set([403]));
 await probe("/api/chess/payroll-execute",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":"https://attacker.example"},
  body:"{}",
 },allowedDenied);
 await probe("/api/chess/license-verify",{
  method:"POST",headers:{"Content-Type":"application/json","Origin":"https://attacker.example"},
  body:"{}",
 },allowedDenied);
 await probe("/api/chess/documents?businessId=unit&clientProfileId=client&service=TAX&documentId=doc",{},allowedDenied);
 await probe("/api/client-profiles",{},allowedDenied);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
