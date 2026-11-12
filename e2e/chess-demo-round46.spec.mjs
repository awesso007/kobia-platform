import AxeBuilder from "@axe-core/playwright";
import {clerk} from "@clerk/testing/playwright";
import {expect,test} from "@playwright/test";

// Round 46: real sessions ONLY in the manually approved chess-demo-e2e
// environment. The URL, Neon chess_demo database and all three Clerk TEST
// identities are checked by the Playwright preflight BEFORE the browser starts.
// No cookies, live customers, provider callbacks or fabricated consent.
const roles={
 owner:process.env.CHESS_DEMO_OWNER_EMAIL,
 employee:process.env.CHESS_DEMO_EMPLOYEE_EMAIL,
 client:process.env.CHESS_DEMO_CLIENT_EMAIL,
};
const seededTask="Fictional employee browser acceptance task";

async function login(page,role){
 const email=roles[role];
 if(!email)throw new Error("Verified Clerk TEST "+role+" identity required");
 await page.goto("/chess-demo/login");
 await expect(page.getByText("Sign in to your account")).toBeVisible();
 await clerk.signIn({page,emailAddress:email});
}
async function api(page,path,method="GET",input){
 return page.evaluate(async({path,method,input})=>{
  const result=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
   ...(input===undefined?{}:{headers:{"Content-Type":"application/json"},
    body:JSON.stringify(input)})});
  return {status:result.status,payload:await result.json().catch(()=>null)};
 },{path,method,input});
}
async function business(page,slug){
 const list=await api(page,"/api/chess/business-units");
 expect(list.status).toBe(200);
 const found=list.payload?.businesses?.find(x=>x.slug===slug);
 expect(found?.id).toBeTruthy();
 return found.id;
}
async function assertSeriousAxeClean(page,label){
 const report=await new AxeBuilder({page})
  .withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
 const severe=report.violations.filter(x=>
  ["critical","serious"].includes(x.impact)).map(x=>x.id);
 expect(severe,label+" WCAG 2.1 AA severe violations").toEqual([]);
}

test("Round 46 owner navigates real fictional accounting task from an eight-unit tour without creating a financial case",async({page})=>{
 await login(page,"owner");
 await page.goto("/app/overview");
 const id=await business(page,"accounting");
 await page.goto("/app/demo");
 await expect(page.getByRole("heading",{name:"CHESS Corporation fictional sandbox"})).toBeVisible();
 await expect(page.getByRole("article")).toHaveCount(8);
 const accounting=page.getByRole("article").filter({
  has:page.getByRole("heading",{name:"Accounting",exact:true}),
 });
 await expect(accounting).toHaveCount(1);
 await accounting.getByRole("link",{name:"View work items"}).click();
 await expect(page).toHaveURL(new RegExp("/app/work-items\\?businessId="+id+"(?:&|$)"));
 await expect(page.getByRole("heading",{name:"Employee work items"})).toBeVisible();
 await expect(page.getByText("Fictional accounting client follow-up",{exact:true})).toBeVisible();
 const work=await api(page,"/api/chess/work-items?businessId="+encodeURIComponent(id));
 expect(work.status).toBe(200);
 expect(work.payload?.workItems?.some(x=>x.title==="Fictional accounting client follow-up")).toBe(true);
 await page.goto("/app/finance-operations?businessId="+encodeURIComponent(id));
 await expect(page.getByRole("heading",{name:"Accounting, bookkeeping, payroll and tax"})).toBeVisible();
 await expect(page.getByText("No active financial service cases are assigned and explicitly granted to this account.")).toBeVisible();
});

test("Round 46 employee two stale browser tabs cannot overwrite one fictional nonterminal task",async({page,context})=>{
 await login(page,"employee");
 await page.goto("/app/overview");
 const id=await business(page,"bookkeeping");
 const url="/app/work-items?businessId="+encodeURIComponent(id);
 const path="/api/chess/work-items?businessId="+encodeURIComponent(id);
 await page.goto(url);
 const other=await context.newPage();
 try{
  await other.goto(url);
  const initial=await api(page,path);
  expect(initial.status).toBe(200);
  const task=initial.payload?.workItems?.find(x=>x.title===seededTask);
  expect(task?.id).toBeTruthy();
  expect(["TODO","IN_PROGRESS","BLOCKED"]).toContain(task.status);
  const next=task.status==="IN_PROGRESS"?"BLOCKED":"IN_PROGRESS";
  const label=next.replaceAll("_"," ");
  const firstRow=page.locator("li").filter({
   has:page.getByText(seededTask,{exact:true}),
  }).first();
  const staleRow=other.locator("li").filter({
   has:other.getByText(seededTask,{exact:true}),
  }).first();
  await expect(firstRow).toBeVisible();
  await expect(staleRow).toBeVisible();
  const accepted=page.waitForResponse(x=>
   x.url().includes("/api/chess/work-items")&&x.request().method()==="PATCH");
  await firstRow.getByRole("button",{name:label,exact:true}).click();
  expect((await accepted).status()).toBe(200);
  const stale=other.waitForResponse(x=>
   x.url().includes("/api/chess/work-items")&&x.request().method()==="PATCH");
  await staleRow.getByRole("button",{name:label,exact:true}).click();
  expect((await stale).status()).toBe(409);
  await expect(other.getByRole("alert")).toContainText("changed since you opened it");
  const again=await api(page,path);
  expect(again.status).toBe(200);
  const final=again.payload.workItems.find(x=>x.id===task.id);
  expect(final.status).toBe(next);
  expect(final.updatedAt).not.toBe(task.updatedAt);
  await other.reload();
  await expect(other.locator("li").filter({
   has:other.getByText(seededTask,{exact:true}),
  }).first()).toContainText(label);
 }finally{await other.close();}
});

test("Round 46 support employee cannot change or create a mortgage task even with owner's real fictional IDs",async({browser})=>{
 const ownerContext=await browser.newContext();
 const employeeContext=await browser.newContext();
 try{
  const owner=await ownerContext.newPage();
  await login(owner,"owner");await owner.goto("/app/overview");
  const mortgage=await business(owner,"mortgage");
  const ownerTasks=await api(owner,"/api/chess/work-items?businessId="+encodeURIComponent(mortgage));
  expect(ownerTasks.status).toBe(200);
  const source=ownerTasks.payload?.workItems?.find(x=>x.title==="Fictional mortgage client follow-up");
  expect(source?.id).toBeTruthy();

  const employee=await employeeContext.newPage();
  await login(employee,"employee");await employee.goto("/app/overview");
  const foreign=await api(employee,"/api/chess/work-items?businessId="+encodeURIComponent(mortgage));
  expect(foreign.status).toBe(403);
  expect(foreign.payload?.workItems).toBeUndefined();
  const create=await api(employee,"/api/chess/work-items","POST",{
   businessId:mortgage,title:"FICTIONAL forbidden cross-business task",
  });
  expect(create.status).toBe(403);
  const change=await api(employee,"/api/chess/work-items","PATCH",{
   id:source.id,businessId:mortgage,status:"IN_PROGRESS",
   expectedUpdatedAt:source.updatedAt,
  });
  expect(change.status).toBe(403);
  const after=await api(owner,"/api/chess/work-items?businessId="+encodeURIComponent(mortgage));
  expect(after.status).toBe(200);
  expect(after.payload?.workItems?.find(x=>x.id===source.id))
   .toMatchObject({status:source.status,updatedAt:source.updatedAt});
  expect(after.payload?.workItems?.some(x=>x.title.includes("forbidden cross-business"))).toBe(false);
  await employee.goto("/app/work-items?businessId="+encodeURIComponent(mortgage));
  await expect(employee.getByRole("heading",{name:"Work items unavailable"})).toBeVisible();
 }finally{await employeeContext.close();await ownerContext.close();}
});

test("Round 46 verified fictional client cannot accept consent or see another client after spoofed navigation and private API requests",async({browser})=>{
 const ownerContext=await browser.newContext();
 const clientContext=await browser.newContext();
 try{
  const owner=await ownerContext.newPage();
  await login(owner,"owner");await owner.goto("/app/overview");
  const unit=await business(owner,"accounting");
  const client=await clientContext.newPage();
  await login(client,"client");
  await client.goto("/chess-demo/client?profileId=forged-other-client");
  const main=client.getByRole("main");
  await expect(main.getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
  await expect(main.getByText("PENDING",{exact:true})).toHaveCount(1);
  await expect(main.getByText("Riley Sample (FICTIONAL)")).toHaveCount(0);
  await expect(main.getByText("Jamie Example (FICTIONAL)")).toHaveCount(0);
  await expect(main.getByRole("button")).toHaveCount(0);

  const consent=await api(client,"/api/chess/client-consent?tenant=chess-demo","POST",{
   consentId:"fictional-unapproved",policyVersion:"fictional-demo-v1",accept:true,
  });
  expect(consent.status).toBe(403);
  const revoke=await api(client,"/api/chess/client-consent?tenant=chess-demo","DELETE",{
   consentId:"fictional-unapproved",
  });
  expect(revoke.status).toBe(403);
  const data=await api(client,"/api/chess/documents?"+new URLSearchParams({
   documentId:"fictional-secret",businessId:unit,
   clientProfileId:"forged-other-client",service:"ACCOUNTING",
  }));
  expect(data.status).toBe(403);
  expect(data.payload?.url).toBeUndefined();
  await client.reload();
  await expect(client.getByRole("main").getByText("PENDING",{exact:true})).toHaveCount(1);
  await expect(client.getByRole("main").getByText("Riley Sample (FICTIONAL)")).toHaveCount(0);
 }finally{await clientContext.close();await ownerContext.close();}
});

test("Round 46 calendar acknowledgement and independent appointment preference round trip without provider sync",async({page})=>{
 await login(page,"employee");await page.goto("/app/overview");
 const id=await business(page,"bookkeeping");
 // Only the fictional employee's preference changes. No external calendar
 // connection or provider worker is permitted in this protected demo.
 const reset=()=>api(page,"/api/chess/calendar-preferences","PATCH",{enabled:false});
 try{
  expect((await reset()).status).toBe(200);
  await page.goto("/app/work-items?businessId="+encodeURIComponent(id));
  await expect(page.getByText("Work-item sharing: Off")).toBeVisible();
  await expect(page.getByText("Appointment sharing: Off")).toBeVisible();
  await expect(page.getByRole("button",{name:"Enable appointment sharing"})).toBeDisabled();
  await page.getByRole("checkbox",{
   name:/I explicitly authorize sharing generic work-item timing/,
  }).check();
  const enabled=page.waitForResponse(x=>x.url().includes("/api/chess/calendar-preferences")&&
   x.request().method()==="PATCH");
  await page.getByRole("button",{name:"Enable work-item calendar sharing"}).click();
  expect((await enabled).status()).toBe(200);
  await expect(page.getByText("Work-item sharing: Consented")).toBeVisible();
  await expect(page.getByText("Appointment sharing: Off")).toBeVisible();
  await page.getByRole("checkbox",{
   name:/I separately authorize sharing generic appointment timing/,
  }).check();
  const appointment=page.waitForResponse(x=>
   x.url().includes("/api/chess/calendar-preferences")&&
   x.request().method()==="PATCH");
  await page.getByRole("button",{name:"Enable appointment sharing"}).click();
  expect((await appointment).status()).toBe(200);
  await expect(page.getByText("Appointment sharing: Consented")).toBeVisible();
  const off=page.waitForResponse(x=>x.url().includes("/api/chess/calendar-preferences")&&
   x.request().method()==="PATCH");
  await page.getByRole("button",{name:"Disable all calendar sharing"}).click();
  expect((await off).status()).toBe(200);
  await page.reload();
  await expect(page.getByText("Work-item sharing: Off")).toBeVisible();
  await expect(page.getByText("Appointment sharing: Off")).toBeVisible();
  const final=await api(page,"/api/chess/calendar-preferences");
  expect(final).toMatchObject({status:200,payload:{enabled:false,appointmentsEnabled:false}});
 }finally{await reset();}
});

test("Round 46 narrow-screen employee and client retain role boundaries and serious WCAG checks",async({browser})=>{
 const contexts=await Promise.all([browser.newContext({
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 }),browser.newContext({
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,
 })]);
 try{
  const employee=await contexts[0].newPage();
  await login(employee,"employee");await employee.goto("/app/overview");
  await employee.goto("/app/work-items");
  await expect(employee.getByRole("heading",{name:"Employee work items"})).toBeVisible();
  await expect(employee.getByRole("heading",{name:"Manager oversight"})).toHaveCount(0);
  await assertSeriousAxeClean(employee,"Mobile employee work");

  const client=await contexts[1].newPage();
  await login(client,"client");await client.goto("/chess-demo/client");
  await expect(client.getByRole("heading",{name:"Your CHESS client preview"})).toBeVisible();
  await expect(client.getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
  await expect(client.getByRole("main").getByRole("button")).toHaveCount(0);
  await assertSeriousAxeClean(client,"Mobile verified client preview");
 }finally{await Promise.all(contexts.map(x=>x.close()));}
});
