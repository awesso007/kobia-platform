import {describe,expect,it} from "vitest";
import {regulatedHandoffStatus} from "./regulated-handoffs";
import {sourceHostApproved} from "./regulated-access";
describe("M6 release-gated provider status and official evidence",()=>{
 it("does not confuse provider pending or not-found with a completed coordination ticket",()=>{
  expect(regulatedHandoffStatus("accepted")).toBe("SUBMITTED");
  expect(regulatedHandoffStatus("rejected")).toBe("REJECTED");
  expect(regulatedHandoffStatus("pending")).toBe("UNKNOWN");
  expect(regulatedHandoffStatus("not_found")).toBe("UNKNOWN");
  expect(regulatedHandoffStatus("invalid")).toBe("UNKNOWN");
 });
 it("requires the exact approved HTTPS official registry source",()=>{
  expect(sourceHostApproved("https://official.test.gov/registry/id",
   "official.test.gov")).toBe(true);
  expect(sourceHostApproved("http://official.test.gov/registry",
   "official.test.gov")).toBe(false);
  expect(sourceHostApproved("https://official.test.gov.evil.invalid/id",
   "official.test.gov")).toBe(false);
  expect(sourceHostApproved("https://username@official.test.gov/id",
   "official.test.gov")).toBe(false);
  expect(sourceHostApproved("https://official.test.gov/id",undefined)).toBe(false);
 });
});
