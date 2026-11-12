import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {canReadChessWorkBusiness} from "./workflow";

describe("Round 41 employee task role and business revocation hardening",()=>{
 const allowed={membershipStatus:"ACTIVE",role:"MEMBER",
  unitStatus:"ACTIVE",currentAssignment:true};
 it("requires a live individual assignment for a member",()=>{
  expect(canReadChessWorkBusiness(allowed)).toBe(true);
  expect(canReadChessWorkBusiness({...allowed,currentAssignment:false})).toBe(false);
  expect(canReadChessWorkBusiness({...allowed,unitStatus:"SUSPENDED"})).toBe(false);
  expect(canReadChessWorkBusiness({...allowed,membershipStatus:"SUSPENDED"})).toBe(false);
  expect(canReadChessWorkBusiness({...allowed,role:"VIEWER"})).toBe(false);
 });
 it("lets current active owners/admins see work without assignment",()=>{
  expect(canReadChessWorkBusiness({...allowed,role:"OWNER",
   currentAssignment:false})).toBe(true);
  expect(canReadChessWorkBusiness({...allowed,role:"ADMIN",
   currentAssignment:false})).toBe(true);
  expect(canReadChessWorkBusiness({...allowed,role:"OWNER",
   membershipStatus:"SUSPENDED",currentAssignment:false})).toBe(false);
  expect(canReadChessWorkBusiness({...allowed,role:"ADMIN",
   unitStatus:"INACTIVE",currentAssignment:false})).toBe(false);
 });
 it("audits sensitive task lists and uses transactional authorization on mutations",()=>{
  const source=readFileSync("src/lib/chess/workflow.ts","utf8");
  const audit=readFileSync("src/lib/chess/sensitive-read-audit.ts","utf8");
  const list=source.slice(source.indexOf("export async function listChessWorkItems"),
   source.indexOf("export class WorkItemConflictError"));
  const transition=source.slice(source.indexOf("export async function transitionChessWorkItem"));
  expect(list).toContain("auditedChessSensitiveRead");
  expect(list).toContain('action:"EMPLOYEE_WORK_ITEMS_READ"');
  expect(list).toContain("tx.chessEmployeeAssignment.findUnique");
  expect(list).toContain("tx.chessWorkItem.findMany");
  expect(transition).toContain('tx.membership.findUnique');
  expect(transition).toContain('tx.chessEmployeeAssignment.findUnique');
  expect(transition).toContain('isolationLevel:"Serializable"');
  expect(audit).toContain('"EMPLOYEE_WORK_ITEMS_READ"');
 });
});
