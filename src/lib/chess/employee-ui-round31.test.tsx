import * as React from "react";
import {describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import FinancialAttemptMonitor from "@/app/app/(crm)/financial-attempts/FinancialAttemptMonitor";
import RecurrencesClient from "@/app/app/(crm)/work-items/RecurrencesClient";
import ChessDeskDirectory from "@/app/app/(crm)/chess-desk/ChessDeskDirectory";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));

describe("Round 31 manager financial exception and recurrence screens",()=>{
 const zero={RESERVED:0,EXECUTING:0,UNKNOWN:0,COMMITTED:0,FAILED:0,CANCELLED:0};
 it("shows unknown outcome requiring independent review but no financial retry or settlement control",()=>{
  const html=renderToStaticMarkup(<FinancialAttemptMonitor
   counts={{...zero,UNKNOWN:2,COMMITTED:1}}
   oldestUnconfirmedAt="2026-11-11T04:15:00.000Z"
   recent={[{status:"UNKNOWN",reservedAt:"2026-11-11T04:15:00Z",
    updatedAt:"2026-11-11T04:16:00Z"}]}/>);
  expect(html).toContain("2 execution or UNKNOWN attempt(s)");
  expect(html).toContain("2026-11-11 04:15 UTC");
  expect(html).toContain("settlement is not proven");
  expect(html).toContain("Do not retry an ambiguous bank posting");
  expect(html).toContain("This monitoring screen cannot execute");
  expect(html).not.toContain("Post approved journal");
  expect(html).not.toContain("Retry now");
 });
 it("renders an empty safe state without confusing lack of records with a healthy provider",()=>{
  const html=renderToStaticMarkup(<FinancialAttemptMonitor counts={zero}
   oldestUnconfirmedAt={null} recent={[]}/>);
  expect(html).toContain("No financial posting attempts");
  expect(html).toContain("No EXECUTING or UNKNOWN");
 });
 it("shows blocked scheduler inspection time without claiming task creation",()=>{
  const html=renderToStaticMarkup(<RecurrencesClient businessId="fictional"
   initialRecurrences={[{
    id:"recurrence-1",title:"Review fictional bookkeeping",
    frequency:"MONTHLY",interval:1,active:true,
    nextRunAt:"2026-11-01T10:00:00.000Z",lastRunAt:null,
    lastInspectedAt:"2026-11-11T03:12:00.000Z",
    assignedClerkUserId:null,updatedAt:"2026-11-11T03:10:00.000Z",
   }]}/>);
  expect(html).toContain("Worker last inspected 2026-11-11 03:12 UTC");
  expect(html).toContain("not that a task was created");
  expect(html).toContain("This screen cannot run the scheduler");
 });
 it("identifies never-inspected recurrence templates",()=>{
  const html=renderToStaticMarkup(<RecurrencesClient businessId="fictional"
   initialRecurrences={[{
    id:"recurrence-2",title:"Fictional monthly follow-up",
    frequency:"MONTHLY",interval:1,active:false,
    nextRunAt:"2026-12-01T10:00:00.000Z",lastRunAt:null,
    lastInspectedAt:null,assignedClerkUserId:null,updatedAt:"2026-11-11T00:00:00Z",
   }]}/>);
  expect(html).toContain("Never inspected by scheduled worker");
  expect(html).toContain("Paused");
 });
 it("shows financial exception navigation only to managers and not support staff",()=>{
  const support=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={false}
   isBusinessManager={false} hasBusiness={true}/>);
  const manager=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={false}
   isBusinessManager={true} hasBusiness={true}/>);
  const admin=renderToStaticMarkup(<ChessDeskDirectory isAdministrator={true}
   isBusinessManager={false} hasBusiness={true}/>);
  expect(support).not.toContain('href="/app/financial-attempts"');
  expect(manager).toContain('href="/app/financial-attempts"');
  expect(manager).toContain("Business manager workspaces");
  expect(manager).not.toContain('href="/app/security-operations"');
  expect(admin).toContain('href="/app/financial-attempts"');
 });
});
