/**
 * Fail the regular CI build if any configured KOBIA legacy Vercel cron
 * entrypoint can start before machine Bearer authentication.
 * This is a source drift check, not proof of external scheduler acceptance.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const schedule = JSON.parse(readFileSync("vercel.json", "utf8")).crons;
const root = "src/app/api/cron";
const scheduled = new Set(schedule.map((cron) => cron.path));
const directories = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
const actual = new Set(directories.map((name) => `/api/cron/${name}`));
const issues = [];
if (scheduled.size !== schedule.length) issues.push("Duplicate Vercel cron schedule paths");
for (const route of scheduled) {
  if (!route.startsWith("/api/cron/") || !actual.has(route)) issues.push(`Missing implementation for ${route}`);
}
for (const path of actual) {
  if (!scheduled.has(path)) issues.push(`Unscheduled machine cron requires review: ${path}`);
  const file = join(root, path.slice("/api/cron/".length), "route.ts");
  let src;
  try { src = readFileSync(file, "utf8"); }
  catch { issues.push(`Missing cron route source: ${file}`); continue; }
  const expectedImport = /import\s*\{\s*requireKobiaCronAuth\s*\}\s*from\s*["']@\/lib\/security\/cron-authorization["']/;
  const firstStatement = /export\s+async\s+function\s+GET\s*\(req:\s*Request\)\s*\{\s*(?:\/\/[^\n]*\n\s*)?const denied = requireKobiaCronAuth\(req\);\s*if \(denied\) return denied;/;
  if (!expectedImport.test(src) || !firstStatement.test(src)) {
    issues.push(`Ungated cron GET machine route: ${file}`);
  }
  if (/export\s+(?:async\s+)?function\s+(?:POST|PATCH|PUT|DELETE)\s*\(/.test(src)) {
    issues.push(`New mutation method needs independent review: ${file}`);
  }
}
console.log(`Round 47 machine cron auth gate: ${actual.size} route(s), ${scheduled.size} schedules, ${issues.length} issue(s)`);
if (issues.length) throw new Error(issues.join("\n"));
