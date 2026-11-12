import {describe,it,expect} from "vitest";
import type {PrismaClient} from "@/lib/db/generated/tenant";
import {auditedChessEmployeeRead,auditedChessManagerRead,auditedChessSensitiveRead,sensitiveReadEvent} from "./sensitive-read-audit";

const ctx={businessId:"business-id",actorClerkUserId:"staff-id",
 action:"REGULATED_WORKFLOW_READ" as const,
 resourceType:"ChessServiceCase" as const,resourceId:"case-id"};
describe("serializable, fail-closed sensitive workflow reads",()=>{
 it("records only opaque scope/actor/reference, never client names or payload",()=>{
  const event=sensitiveReadEvent(ctx,true);
  expect(event).toEqual({...ctx,decision:"ALLOW"});
  expect(Object.keys(event).sort()).toEqual([
   "action","actorClerkUserId","businessId","decision","resourceId","resourceType"].sort());
 });
 it("records private portfolio audits without a fictional business scope",()=>{
  expect(sensitiveReadEvent({actorClerkUserId:"owner",action:"OPERATIONS_PORTFOLIO_READ",
   resourceType:"ChessOperationsPortfolio",resourceId:"2026-11"},true)).toEqual({
    actorClerkUserId:"owner",action:"OPERATIONS_PORTFOLIO_READ",
    resourceType:"ChessOperationsPortfolio",resourceId:"2026-11",decision:"ALLOW"});
 });
 it("returns scoped rows only after an ALLOW audit commits",async()=>{
  const captured:unknown[]=[];
  const db={$transaction:async(read:Function)=>{
   return read({chessSecurityEvent:{create:async(v:unknown)=>{captured.push(v);}}});
  }} as unknown as PrismaClient;
  await expect(auditedChessSensitiveRead(db,ctx,async()=>["fictional"])).resolves
   .toEqual(["fictional"]);
  expect(captured).toEqual([{data:{...ctx,decision:"ALLOW"}}]);
 });
 it("fails a DENY read and preserves its audit decision",async()=>{
  const captured:unknown[]=[];
  const db={$transaction:async(read:Function)=>{
   return read({chessSecurityEvent:{create:async(v:unknown)=>{captured.push(v);}}});
  }} as unknown as PrismaClient;
  await expect(auditedChessSensitiveRead(db,ctx,async()=>null)).rejects.toThrow();
  expect(captured).toEqual([{data:{...ctx,decision:"DENY"}}]);
 });
 it("does not disclose data if audit insert fails",async()=>{
  const db={$transaction:async(read:Function)=>{
   return read({chessSecurityEvent:{create:async()=>{
    throw new Error("Audit ledger unavailable");
   }}});
  }} as unknown as PrismaClient;
  await expect(auditedChessSensitiveRead(db,ctx,async()=>["private"]))
   .rejects.toThrow("Audit ledger unavailable");
 });
});

describe("manager-scoped privacy audits on sensitive directories",()=>{
 function mockDb(role:"ADMIN"|"MEMBER"|"VIEWER",assigned:"MANAGER"|"SUPPORT"|null,revoked=false){
  const captured:unknown[]=[];
  let reads=0;
  const tx={
   membership:{findUnique:async()=>({status:"ACTIVE",role})},
   chessBusinessUnit:{findUnique:async()=>({status:"ACTIVE"})},
   chessEmployeeAssignment:{findUnique:async()=>assigned?{role:assigned,revokedAt:revoked?new Date():null}:null},
   chessSecurityEvent:{create:async(event:unknown)=>{captured.push(event);}},
  };
  const db={
   $transaction: async (callback: (client: unknown) => Promise<unknown>) => {
    return callback(tx);
   },
  } as unknown as PrismaClient;
  const read=async()=>{reads++;return [{id:"private-row"}];};
  return {db,captured,read,reads:()=>reads};
 }
 const managerCtx={businessId:"unit-a",actorClerkUserId:"staff-a",
  action:"APPOINTMENT_DIRECTORY_READ" as const,
  resourceType:"ChessAppointment" as const,resourceId:"business:unit-a"};
 it("audits owner/admin and assigned managers before returning data",async()=>{
  for(const [role,assignment] of [
   ["ADMIN",null],["MEMBER","MANAGER"],
  ] as const){
   const state=mockDb(role,assignment);
   await expect(auditedChessManagerRead(state.db,managerCtx,state.read))
    .resolves.toEqual([{id:"private-row"}]);
   expect(state.reads()).toBe(1);
   expect(state.captured).toEqual([{data:{...managerCtx,decision:"ALLOW"}}]);
  }
 });
 it("never SELECTs private rows after revoked, unsupported or missing assignment",async()=>{
  for(const [role,assignment,revoked] of [
   ["VIEWER",null,false],["MEMBER",null,false],
   ["MEMBER","SUPPORT",false],["MEMBER","MANAGER",true],
  ] as const){
   const state=mockDb(role,assignment,revoked);
   await expect(auditedChessManagerRead(state.db,managerCtx,state.read))
    .rejects.toThrow();
   expect(state.reads()).toBe(0);
   expect(state.captured).toEqual([{data:{...managerCtx,decision:"DENY"}}]);
  }
 });
});

describe("transactional employee-only private data audits",()=>{
 function fake(role:"OWNER"|"ADMIN"|"MEMBER"|"VIEWER",
  assigned:boolean,revoked=false,active=true){
  let returned=0;
  const events:unknown[]=[];
  const tx={
   membership:{findUnique:async()=>({role,status:active?"ACTIVE":"SUSPENDED"})},
   chessBusinessUnit:{findUnique:async()=>({status:"ACTIVE"})},
   chessEmployeeAssignment:{findUnique:async()=>assigned?{
    revokedAt:revoked?new Date():null,
   }:null},
   chessSecurityEvent:{create:async(data:unknown)=>{events.push(data);}},
  };
  const db={
   $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
    return callback(tx);
   },
  } as unknown as PrismaClient;
  const read=async()=>{returned++;return [{id:"restricted-employee-event"}];};
  return {db,events,read,returned:()=>returned};
 }
 const input={businessId:"business",actorClerkUserId:"actor",
  action:"EMPLOYEE_ALERTS_READ" as const,
  resourceType:"ChessEmployeeAlert" as const,resourceId:"recipient:actor"};
 it("allows only current owner, admin or actively assigned staff",async()=>{
  for(const [role,assigned] of [
   ["OWNER",false],["ADMIN",false],["MEMBER",true],
  ] as const){
   const state=fake(role,assigned);
   await expect(auditedChessEmployeeRead(state.db,input,state.read))
    .resolves.toEqual([{id:"restricted-employee-event"}]);
   expect(state.returned()).toBe(1);
   expect(state.events).toEqual([{data:{...input,decision:"ALLOW"}}]);
  }
 });
 it("logs DENY and performs no SELECT for suspended or revoked employees",async()=>{
  for(const [role,assigned,revoked,active] of [
   ["MEMBER",false,false,true],
   ["MEMBER",true,true,true],
   ["VIEWER",true,false,true],
   ["ADMIN",true,false,false],
  ] as const){
   const state=fake(role,assigned,revoked,active);
   await expect(auditedChessEmployeeRead(state.db,input,state.read))
    .rejects.toThrow();
   expect(state.returned()).toBe(0);
   expect(state.events).toEqual([{data:{...input,decision:"DENY"}}]);
  }
 });
});
