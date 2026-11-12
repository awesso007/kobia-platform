import {describe,it,expect} from "vitest";
import type {PrismaClient} from "@/lib/db/generated/tenant";
import {auditedChessSensitiveRead,sensitiveReadEvent} from "./sensitive-read-audit";

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
