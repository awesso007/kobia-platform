import {afterEach,describe,expect,it,vi} from "vitest";
import {isAuthorizedScanWorker,scanWorkerInput} from "./clamav-worker";
afterEach(()=>vi.unstubAllEnvs());
describe("machine-only scanning worker",()=>{
 it("rejects missing or weak secret",()=>{
  vi.stubEnv("CHESS_SCAN_WORKER_TOKEN","short");
  expect(isAuthorizedScanWorker("short")).toBe(false);
  vi.stubEnv("CHESS_SCAN_WORKER_TOKEN","");
  expect(isAuthorizedScanWorker("token")).toBe(false);
 });
 it("compares a configured secret, not caller-provided tenant claims",()=>{
  vi.stubEnv("CHESS_SCAN_WORKER_TOKEN","x".repeat(64));
  expect(isAuthorizedScanWorker("x".repeat(64))).toBe(true);
  expect(isAuthorizedScanWorker("y".repeat(64))).toBe(false);
 });
 it("bounds scanning batch size",()=>{
  expect(scanWorkerInput.safeParse({limit:1}).success).toBe(true);
  expect(scanWorkerInput.safeParse({limit:9999}).success).toBe(false);
 });
});
