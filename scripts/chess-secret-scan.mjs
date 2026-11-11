import {execFileSync} from "node:child_process";
import {readFileSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const patterns=[
 ["AWS access key",/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
 ["GitHub token",/\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{35,}\b/g],
 ["Stripe live secret",/\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/g],
 ["Google API key",/\bAIza[0-9A-Za-z_-]{35}\b/g],
 ["OpenAI-style key",/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{35,}\b/g],
 ["PEM private key",/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
];
export function scanSecretPatterns(content){
 const issues=[];
 for(const [kind,pattern] of patterns){
  pattern.lastIndex=0;
  for(const m of content.matchAll(pattern))
   issues.push({kind,line:content.slice(0,m.index).split("\n").length});
 }
 return issues;
}
/** Fail closed if tracked text contains familiar real credential formats.
 * This cannot replace hosted scanning or rotating exposed keys. */
export function scanTracked(root=process.cwd()){
 const names=execFileSync("git",["ls-files","-z"],{cwd:root,encoding:"utf8"})
  .split("\0").filter(Boolean);
 const results=[];
 for(const name of names){
  if(name==="package-lock.json"||name.startsWith("public/")||
   /\.(png|jpe?g|gif|ico|webp|pdf|woff2?)$/i.test(name))continue;
  const path=resolve(root,name),stats=statSync(path);
  if(!stats.isFile()||stats.size>2_000_000)continue;
  for(const issue of scanSecretPatterns(readFileSync(path,"utf8")))
   results.push({path:name,...issue});
 }
 return results;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const issues=scanTracked();
  for(const x of issues)console.error(`Potential ${x.kind} in ${x.path}:${x.line}`);
  if(issues.length){console.error("Rotate any exposed keys; CI is blocked.");process.exitCode=1;}
  else console.log("Tracked source credential patterns passed.");
 }catch(e){
  console.error("Unable to verify tracked files; fail closed.",e?.message);
  process.exitCode=1;
 }
}
