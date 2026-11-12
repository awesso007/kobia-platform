import * as React from "react";
import {beforeEach,describe,expect,it,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {selectChessWorkspace} from "./workspace-selection";
import {listChessManagedBusinessUnits} from "./business-manager";
import {getCurrentMembership} from "@/lib/rbac/require-permission";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {listBusinessUnits} from "./business-units";
import ChessDeskDirectory from "@/app/app/(crm)/chess-desk/ChessDeskDirectory";
import WorkItemsClient from "@/app/app/(crm)/work-items/WorkItemsClient";
import RecurrencesClient from "@/app/app/(crm)/work-items/RecurrencesClient";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>undefined})}));
vi.mock("@/lib/rbac/require-permission",()=>({
 getCurrentMembership:vi.fn(),
 PermissionError:class PermissionError extends Error {},
}));
vi.mock("@/lib/db/get-tenant-db",()=>({getTenantDb:vi.fn()}));
vi.mock("./business-units",()=>({listBusinessUnits:vi.fn()}));
const units=[
 {id:"bookkeeping",slug:"bookkeeping",name:"Bookkeeping",status:"ACTIVE"},
 {id:"insurance",slug:"insurance",name:"Insurance",status:"ACTIVE"},
];
const allowed={getCurrentMembership:vi.mocked(getCurrentMembership),
 listBusinessUnits:vi.mocked(listBusinessUnits)};
beforeEach(()=>{
 vi.clearAllMocks();
 allowed.listBusinessUnits.mockResolvedValue(units as never);
});

describe("Round 33 authorized business navigation",()=>{
 it("chooses the first permitted unit only when the user did not specify one",()=>{
  expect(selectChessWorkspace(units)).toMatchObject({
   status:"READY",selected:{id:"bookkeeping"},
  });
  expect(selectChessWorkspace(units,"insurance")).toMatchObject({
   status:"READY",selected:{id:"insurance"},
  });
  expect(selectChessWorkspace(units,"revoked")).toEqual({
   status:"UNAVAILABLE",selected:null,
  });
  expect(selectChessWorkspace([])).toEqual({status:"NONE",selected:null});
 });
 it("shows manager-only finance entries for actual MANAGER assignments",async()=>{
  allowed.getCurrentMembership.mockResolvedValue({
   clerkUserId:"member-1",status:"ACTIVE",role:"MEMBER",
  } as never);
  const findMany=vi.fn(async()=>[{businessId:"insurance"}]);
  vi.mocked(getTenantDb).mockReturnValue({
   db:{chessEmployeeAssignment:{findMany}},
  } as never);
  const managed=await listChessManagedBusinessUnits();
  expect(managed.map(unit=>unit.id)).toEqual(["insurance"]);
  expect(findMany).toHaveBeenCalledWith({
   where:{
    clerkUserId:"member-1",role:"MANAGER",revokedAt:null,
    businessId:{in:["bookkeeping","insurance"]},
   },select:{businessId:true},
  });
  const html=renderToStaticMarkup(<ChessDeskDirectory
   hasBusiness={true} isAdministrator={false} isBusinessManager={true}
   managerBusinessId={managed[0]!.id}/>);
  expect(html).toContain('href="/app/finance-operations?businessId=insurance"');
  expect(html).toContain('href="/app/financial-attempts?businessId=insurance"');
  expect(html).not.toContain('href="/app/security-operations"');
  expect(html).not.toContain('href="/app/business-units"');
 });
 it("never shows business-manager links to SUPPORT members without a manager assignment",async()=>{
  allowed.getCurrentMembership.mockResolvedValue({
   clerkUserId:"staff-1",status:"ACTIVE",role:"MEMBER",
  } as never);
  vi.mocked(getTenantDb).mockReturnValue({db:{
   chessEmployeeAssignment:{findMany:vi.fn(async()=>[])},
  }} as never);
  const managed=await listChessManagedBusinessUnits();
  expect(managed).toEqual([]);
  const html=renderToStaticMarkup(<ChessDeskDirectory
   hasBusiness={true} isAdministrator={false}
   isBusinessManager={managed.length>0}/>);
  expect(html).not.toContain('href="/app/finance-operations"');
  expect(html).not.toContain('href="/app/financial-attempts"');
  expect(html).toContain('href="/app/work-items"');
 });
 it("treats revoked or suspended membership as no authorization",async()=>{
  allowed.getCurrentMembership.mockResolvedValue({
   clerkUserId:"old-manager",status:"SUSPENDED",role:"MEMBER",
  } as never);
  await expect(listChessManagedBusinessUnits()).rejects.toThrow();
  expect(listBusinessUnits).not.toHaveBeenCalled();
 });
 it("tenant administrators retain full navigation rather than an employee manager subset",async()=>{
  allowed.getCurrentMembership.mockResolvedValue({
   clerkUserId:"owner-1",status:"ACTIVE",role:"OWNER",
  } as never);
  const unitsForOwner=await listChessManagedBusinessUnits();
  expect(unitsForOwner).toEqual(units);
  expect(getTenantDb).not.toHaveBeenCalled();
  const html=renderToStaticMarkup(<ChessDeskDirectory
   hasBusiness={true} isAdministrator={true} isBusinessManager={false}/>);
  expect(html).toContain('href="/app/business-units"');
  expect(html).toContain('href="/app/security-operations"');
 });
});

describe("Round 33 demo empty-state and recurrence form usability",()=>{
 it("gives staff an actionable empty task message without implying all businesses are empty",()=>{
  const html=renderToStaticMarkup(<WorkItemsClient
   businessId="bookkeeping" initialTasks={[]}/>);
  expect(html).toContain("ask your business manager to assign a task");
  expect(html).toContain("other teams have no work");
 });
 it("offers a staff name select instead of requiring a raw Clerk ID",()=>{
  const html=renderToStaticMarkup(<RecurrencesClient
   businessId="insurance" initialRecurrences={[]}
   staff={[{clerkUserId:"employee-1",displayName:"Fictional coworker",role:"SUPPORT"}]}/>);
  expect(html).toContain("Fictional coworker");
  expect(html).toContain('value="employee-1"');
  expect(html).toContain("Leave unassigned for manager review");
  expect(html).not.toContain("Active employee&#x27;s Clerk user ID");
  expect(html).toContain("No recurring schedules exist");
 });
});
