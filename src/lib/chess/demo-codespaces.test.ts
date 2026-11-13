import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("Round 25 Codespaces setup instructions",()=>{
 it("automatically installs locked dependencies in an isolated Node 20 container",()=>{
  const config=JSON.parse(readFileSync(".devcontainer/devcontainer.json","utf8")) as {
   image?:string;postCreateCommand?:string;forwardPorts?:number[];
  };
  expect(config.image).toMatch(/javascript-node:1-20-bookworm/);
  expect(config.postCreateCommand).toContain("npm ci");
  expect(config.postCreateCommand).toContain("--include=optional");
  expect(config.forwardPorts).toContain(3000);
 });
 it("keeps setup and read-only verification as separate explicitly gated commands",()=>{
  const pkg=JSON.parse(readFileSync("package.json","utf8")) as {
   scripts:Record<string,string>;
  };
  expect(pkg.scripts["demo:setup"]).toContain("--env-file=.env.local");
  expect(pkg.scripts["demo:setup"]).toContain("chess-demo-setup.ts");
  expect(pkg.scripts["demo:verify"]).toContain("chess-demo-verify.ts");
  expect(pkg.scripts["demo:verify"]).not.toContain("prisma migrate");
 });
});
