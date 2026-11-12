import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// Round 40 runs ONLY in the existing manually approved, isolated chess-demo-e2e
// GitHub environment: three distinct verified Clerk TEST identities, a dedicated
// fictional Neon chess_demo DB and localhost. Never mint or bypass real sessions.
const emails={
  owner:process.env.CHESS_DEMO_OWNER_EMAIL,
  employee:process.env.CHESS_DEMO_EMPLOYEE_EMAIL,
  client:process.env.CHESS_DEMO_CLIENT_EMAIL,
};
const taskTitle="Fictional employee browser acceptance task";

async function signIn(page,role){
  const email=emails[role];
  if(!email)throw new Error("Missing verified Clerk demo "+role+" email");
  await page.goto("/chess-demo/login");
  await expect(page.getByText("Sign in to your account")).toBeVisible();
  await clerk.signIn({page,emailAddress:email});
}
async function json(page,path,method="GET",body){
  return page.evaluate(async({path,method,body})=>{
    const res=await fetch(path,{method,credentials:"same-origin",cache:"no-store",
      headers:body===undefined?{}:{"Content-Type":"application/json"},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,body:await res.json().catch(()=>null)};
  },{path,method,body});
}
async function ownerBusiness(page,slug){
  const result=await json(page,"/api/chess/business-units");
  expect(result.status).toBe(200);
  const business=result.body?.businesses?.find(b=>b.slug===slug);
  expect(business?.id).toBeTruthy();
  return business.id;
}

test("employee deep-linked to an unassigned business sees no fallback or private task data",async({browser})=>{
  const ownerContext=await browser.newContext();
  const employeeContext=await browser.newContext();
  try{
    const owner=await ownerContext.newPage();
    await signIn(owner,"owner");
    await owner.goto("/app/overview");
    const foreign=await ownerBusiness(owner,"mortgage");
    const employee=await employeeContext.newPage();
    await signIn(employee,"employee");
    await employee.goto("/app/overview");
    const own=await ownerBusiness(employee,"bookkeeping");
    await employee.goto("/app/work-items?businessId="+encodeURIComponent(foreign));
    await expect(employee.getByRole("heading",{name:"Work items unavailable"})).toBeVisible();
    await expect(employee.getByText(/requested business is no longer assigned/)).toBeVisible();
    await expect(employee.getByText(taskTitle,{exact:true})).toHaveCount(0);
    await expect(employee.getByRole("heading",{name:"Manager oversight"})).toHaveCount(0);
    await expect(employee.getByRole("link",{name:"Return to service desk"})).toBeVisible();
    expect((await json(employee,"/api/chess/work-items?businessId="+encodeURIComponent(foreign))).status).toBe(403);
    await employee.goto("/app/work-items?businessId="+encodeURIComponent(own));
    await expect(employee.getByRole("heading",{name:"Employee work items"})).toBeVisible();
    await expect(employee.getByText(taskTitle,{exact:true})).toBeVisible();
    await expect(employee.getByRole("heading",{name:"Manager oversight"})).toHaveCount(0);
  }finally{
    await employeeContext.close();
    await ownerContext.close();
  }
});

test("employee stale optimistic task update is rejected without changing the demo task",async({page})=>{
  await signIn(page,"employee");
  await page.goto("/app/overview");
  const businessId=await ownerBusiness(page,"bookkeeping");
  const path="/api/chess/work-items?businessId="+encodeURIComponent(businessId);
  const first=await json(page,path);
  expect(first.status).toBe(200);
  const task=first.body?.workItems?.find(t=>t.title===taskTitle);
  expect(task?.id).toBeTruthy();
  expect(["TODO","IN_PROGRESS","BLOCKED"]).toContain(task.status);
  const proposed=task.status==="IN_PROGRESS"?"BLOCKED":"IN_PROGRESS";
  const stale=await json(page,"/api/chess/work-items","PATCH",{
    id:task.id,businessId,status:proposed,
    expectedUpdatedAt:"2001-01-01T00:00:00.000Z",
  });
  expect(stale.status).toBe(409);
  expect(stale.body?.error).toMatch(/changed.*refresh/i);
  const after=await json(page,path);
  const current=after.body?.workItems?.find(t=>t.id===task.id);
  expect(after.status).toBe(200);
  expect(current.status).toBe(task.status);
  expect(current.updatedAt).toBe(task.updatedAt);
  await page.goto("/app/work-items?businessId="+encodeURIComponent(businessId));
  const row=page.locator("li").filter({has:page.getByText(taskTitle,{exact:true})}).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(task.status.replaceAll("_"," "));
});

test("support employee cannot open manager task controls even for their assigned business",async({page})=>{
  await signIn(page,"employee");
  await page.goto("/app/overview");
  const businessId=await ownerBusiness(page,"bookkeeping");
  await page.goto("/app/work-items?businessId="+encodeURIComponent(businessId));
  await expect(page.getByRole("heading",{name:"Employee work items"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Manager oversight"})).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Operations health"})).toHaveCount(0);
  expect((await json(page,"/api/chess/manager-queue?businessId="+encodeURIComponent(businessId))).status).toBe(403);
  await page.goto("/app/business-units");
  await expect(page.getByRole("heading",{name:"Manage business units and staff"})).toHaveCount(0);
});

test("client cannot read a copied employee business ID, task or document endpoint",async({browser})=>{
  const ownerContext=await browser.newContext();
  const clientContext=await browser.newContext();
  try{
    const owner=await ownerContext.newPage();
    await signIn(owner,"owner");
    await owner.goto("/app/overview");
    const businessId=await ownerBusiness(owner,"bookkeeping");
    const client=await clientContext.newPage();
    await signIn(client,"client");
    const response=await client.goto("/chess-demo/client");
    expect(response?.status()).toBe(200);
    await expect(client.getByRole("main").getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
    await expect(client.getByRole("main").getByText("PENDING",{exact:true})).toHaveCount(1);
    const tasks=await json(client,"/api/chess/work-items?businessId="+encodeURIComponent(businessId));
    expect(tasks.status).toBe(403);
    expect(tasks.body?.workItems).toBeUndefined();
    const manager=await json(client,"/api/chess/manager-queue?businessId="+encodeURIComponent(businessId));
    expect(manager.status).toBe(403);
    const docQuery=new URLSearchParams({
      documentId:"fictional-document-does-not-exist",
      businessId,clientProfileId:"fictional-private-client",
      service:"BOOKKEEPING",
    });
    const doc=await json(client,"/api/chess/documents?"+docQuery.toString());
    expect(doc.status).toBe(403);
    expect(doc.body?.url).toBeUndefined();
    const attemptedUpload=await json(client,"/api/chess/documents","POST",{
      businessId,clientProfileId:"fictional-private-client",
      service:"BOOKKEEPING",fileName:"no-pii.pdf",
      mimeType:"application/pdf",size:1234,
    });
    expect(attemptedUpload.status).toBe(403);
    await client.reload();
    await expect(client.getByRole("main").getByText("PENDING",{exact:true})).toHaveCount(1);
    await expect(client.getByRole("main").getByText("Riley Sample (FICTIONAL)")).toHaveCount(0);
  }finally{
    await clientContext.close();
    await ownerContext.close();
  }
});

test("owner, employee and client Clerk sessions remain isolated across concurrent browser contexts",async({browser})=>{
  const contexts=await Promise.all(Array.from({length:3},()=>browser.newContext()));
  try{
    const [owner,employee,client]=await Promise.all(contexts.map(c=>c.newPage()));
    await signIn(owner,"owner");
    await signIn(employee,"employee");
    await signIn(client,"client");
    await owner.goto("/app/overview");
    await employee.goto("/app/overview");
    await client.goto("/chess-demo/client");
    const [ownerUnits,employeeUnits,clientUnits]=await Promise.all([
      json(owner,"/api/chess/business-units"),
      json(employee,"/api/chess/business-units"),
      json(client,"/api/chess/business-units"),
    ]);
    expect(ownerUnits.status).toBe(200);
    expect(ownerUnits.body.businesses).toHaveLength(8);
    expect(employeeUnits.status).toBe(200);
    expect(employeeUnits.body.businesses).toHaveLength(1);
    expect(employeeUnits.body.businesses[0].slug).toBe("bookkeeping");
    expect(clientUnits.status).toBe(403);
    await expect(client.getByRole("heading",{name:"Your CHESS client preview"})).toBeVisible();
    await expect(owner.getByRole("heading",{name:"Workspace overview"})).toBeVisible();
    await expect(employee.getByRole("heading",{name:"My work"})).toBeVisible();
  }finally{
    await Promise.all(contexts.map(c=>c.close()));
  }
});
