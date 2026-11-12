import AxeBuilder from "@axe-core/playwright";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// These identities are three distinct verified users in one Clerk TEST
// instance. No browser-only impersonation, fallback test token, or real client.
const ownerEmail = process.env.CHESS_DEMO_OWNER_EMAIL;
const employeeEmail = process.env.CHESS_DEMO_EMPLOYEE_EMAIL;
const clientEmail = process.env.CHESS_DEMO_CLIENT_EMAIL;
const taskTitle = "Fictional employee browser acceptance task";

async function signIn(page, email) {
  if (!email) throw new Error("A verified Clerk demo test email is required.");
  // The unprotected tenant login renders Clerk before the testing-token
  // sign-in helper creates an actual session for this exact test identity.
  await page.goto("/chess-demo/login");
  await expect(page.getByText("Sign in to your account")).toBeVisible();
  await clerk.signIn({ page, emailAddress: email });
}

async function browserJson(page, path, method = "GET", body = undefined) {
  return page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
  }, { path, method, body });
}

async function assertNoSeriousAxeViolations(page, surface) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations
    .filter((violation) => ["critical", "serious"].includes(violation.impact))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
    }));
  expect(blocking, surface + " has critical/serious WCAG 2.1 A/AA violations")
    .toEqual([]);
}

test("demo owner sees eight separate CHESS businesses and five fictional clients", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "CHESS Corporation - FICTIONAL DEMO",
  })).toBeVisible();

  await page.getByRole("link", { name: "Guided demo tour" }).click();
  await expect(page).toHaveURL(/\/app\/demo$/);
  await expect(page.getByRole("heading", {
    name: "CHESS Corporation fictional sandbox",
  })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(8);
  await expect(page.getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
  await expect(page.getByText("Riley Sample (FICTIONAL)")).toBeVisible();
  await expect(page.getByText(/No valid service grants or accepted consents are seeded/))
    .toBeVisible();

  const units = await browserJson(page, "/api/chess/business-units");
  expect(units.status).toBe(200);
  expect(units.payload?.businesses).toHaveLength(8);
  expect(new Set(units.payload.businesses.map(unit => unit.slug)).size).toBe(8);
});

test("owner can inspect assigned business operations but not fabricate financial cases", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/app/overview");
  await page.goto("/app/business-units");
  await expect(page.getByRole("heading", { name: "Business units", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Manage business units and staff",
  })).toBeVisible();

  const units = await browserJson(page, "/api/chess/business-units");
  expect(units.status).toBe(200);
  const bookkeeping = units.payload.businesses.find(unit => unit.slug === "bookkeeping");
  expect(bookkeeping).toBeTruthy();

  await page.goto("/app/finance-operations?businessId=" + encodeURIComponent(bookkeeping.id));
  await expect(page.getByRole("heading", {
    name: "Accounting, bookkeeping, payroll and tax",
  })).toBeVisible();
  await expect(page.getByText(
    "No active financial service cases are assigned and explicitly granted to this account.",
  )).toBeVisible();
  await expect(page.getByRole("link", { name: "Open client service review" }))
    .toHaveCount(0);

  // A signed-in owner is not the allowlisted fictional CLIENT identity.
  const clientPreview = await page.goto("/chess-demo/client");
  expect(clientPreview?.status()).toBe(404);
});

test("employee signs in, navigates to own work and sees one assigned business only", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/overview"); // Creates only the allowlisted MEMBER/SUPPORT fixture.
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace overview" })).toHaveCount(0);

  await page.getByRole("link", { name: /CHESS service desk/ }).click();
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await expect(page.getByText(/Visible active business units:\s*1\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Employee workspaces" })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Owner and administrator workspaces",
  })).toHaveCount(0);

  await page.getByRole("link", { name: /Work and appointments/ }).click();
  await expect(page.getByRole("heading", { name: "Employee work items" })).toBeVisible();
  await expect(page.getByText(taskTitle, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calendar sharing" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manager oversight" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Operations health" })).toHaveCount(0);

  const units = await browserJson(page, "/api/chess/business-units");
  expect(units.status).toBe(200);
  expect(units.payload.businesses).toHaveLength(1);
  expect(units.payload.businesses[0].slug).toBe("bookkeeping");
});

test("employee changes an assigned task through the UI and sees persisted state", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/overview");
  const units = await browserJson(page, "/api/chess/business-units");
  expect(units.status).toBe(200);
  const businessId = units.payload.businesses.find(unit => unit.slug === "bookkeeping")?.id;
  expect(businessId).toBeTruthy();

  await page.goto("/app/work-items?businessId=" + encodeURIComponent(businessId));
  const row = page.locator("li").filter({
    has: page.getByText(taskTitle, { exact: true }),
  }).first();
  await expect(row).toBeVisible();
  const before = await browserJson(
    page, "/api/chess/work-items?businessId=" + encodeURIComponent(businessId),
  );
  expect(before.status).toBe(200);
  const task = before.payload.workItems.find(item => item.title === taskTitle);
  expect(task).toBeTruthy();
  // Never send an irreversible COMPLETE/CANCEL; reruns alternate the two
  // nonterminal states. A terminal fixture indicates a contaminated demo.
  expect(["TODO", "IN_PROGRESS", "BLOCKED"]).toContain(task.status);
  const next = task.status === "IN_PROGRESS" ? "BLOCKED" : "IN_PROGRESS";
  const label = next.replaceAll("_", " ");

  const patch = page.waitForResponse(response =>
    response.url().includes("/api/chess/work-items") &&
    response.request().method() === "PATCH");
  await row.getByRole("button", { name: label, exact: true }).click();
  const patched = await patch;
  expect(patched.status()).toBe(200);
  expect((await patched.json()).workItem.status).toBe(next);
  await expect(row).toContainText(label);
  await page.reload();
  await expect(page.locator("li").filter({
    has: page.getByText(taskTitle, { exact: true }),
  }).first()).toContainText(label);
});

test("employee cannot read another business or create an administrative unit", async ({ page, browser }) => {
  await signIn(page, ownerEmail);
  await page.goto("/app/overview");
  const ownerUnits = await browserJson(page, "/api/chess/business-units");
  expect(ownerUnits.status).toBe(200);
  const otherBusiness = ownerUnits.payload.businesses.find(unit => unit.slug === "mortgage");
  expect(otherBusiness).toBeTruthy();

  // A separate browser context ensures the owner session is never shared.
  const context = await browser.newContext();
  try {
    const employeePage = await context.newPage();
    await signIn(employeePage, employeeEmail);
    await employeePage.goto("/app/overview");
    const denied = await browserJson(employeePage,
      "/api/chess/work-items?businessId=" + encodeURIComponent(otherBusiness.id));
    expect(denied.status).toBe(403);

    const post = await browserJson(employeePage, "/api/chess/business-units",
      "POST", { slug: "not-authorized", name: "Denied Business Unit" });
    expect(post.status).toBe(403);
    await employeePage.goto("/app/business-units");
    await expect(employeePage.getByRole("heading", {
      name: "Manage business units and staff",
    })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("employee identity cannot view the client-only fictional preview", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/overview");
  const response = await page.goto("/chess-demo/client");
  expect(response?.status()).toBe(404);
});

test("client sees only their verified-email fictional profile and PENDING disclosure", async ({ page }) => {
  await signIn(page, clientEmail);
  const response = await page.goto("/chess-demo/client");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Your CHESS client preview" }))
    .toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
  await expect(main.getByText("service:ACCOUNTING", { exact: true })).toBeVisible();
  await expect(main.getByText("PENDING", { exact: true })).toHaveCount(1);
  await expect(main.getByText("Riley Sample (FICTIONAL)")).toHaveCount(0);
  await expect(main.getByText("Jamie Example (FICTIONAL)")).toHaveCount(0);
  await expect(main.getByRole("heading", {
    name: "This preview cannot accept or withdraw consent",
  })).toBeVisible();
  await expect(main.getByRole("button")).toHaveCount(0);

  // Untrusted URL hints never select a different client's fictional record.
  await page.goto("/chess-demo/client?profileId=another-fake-client");
  await expect(page.getByRole("main").getByText("Morgan Fictional (FICTIONAL)"))
    .toBeVisible();
  await expect(page.getByRole("main").getByText("Riley Sample (FICTIONAL)"))
    .toHaveCount(0);
});

test("client cannot enter employee/admin views or mutate consent while demo is active", async ({ page }) => {
  await signIn(page, clientEmail);
  await page.goto("/chess-demo/client");
  const units = await browserJson(page, "/api/chess/business-units");
  expect(units.status).toBe(403);
  const accept = await browserJson(page,
    "/api/chess/client-consent?tenant=chess-demo",
    "POST", { consentId: "fictional-pending-consent", policyVersion: "fictional-demo-v1", accept: true });
  expect(accept.status).toBe(403);
  const withdraw = await browserJson(page,
    "/api/chess/client-consent?tenant=chess-demo",
    "DELETE", { consentId: "fictional-pending-consent" });
  expect(withdraw.status).toBe(403);

  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "Workspace access unavailable" }))
    .toBeVisible();
  await page.goto("/app/chess-desk");
  await expect(page.getByRole("alert")).toContainText(
    "An active CHESS tenant membership is required",
  );
  await page.goto("/app/security-operations");
  await expect(page.getByRole("alert")).toContainText(
    "only to a current tenant owner or administrator",
  );
  // Approval-gated real client portal stays inaccessible in fictional mode.
  const portal = await page.goto("/client-consents?tenant=chess-demo");
  expect(portal?.status()).toBe(404);

  await page.goto("/chess-demo/client");
  await expect(page.getByRole("main").getByText("PENDING", { exact: true }))
    .toHaveCount(1);
});

test("unauthenticated browser cannot read the fictional client preview", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/chess-demo/client");
    await expect(page).toHaveURL(/\/chess-demo\/login/);
    await expect(page.getByText("Morgan Fictional (FICTIONAL)")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("employee work and owner demo pass automated serious/critical WCAG checks", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/overview");
  await page.goto("/app/work-items");
  await expect(page.getByRole("heading", { name: "Employee work items" })).toBeVisible();
  await assertNoSeriousAxeViolations(page, "Employee work items");
  await page.goto("/app/chess-desk");
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await assertNoSeriousAxeViolations(page, "Employee service desk");
});

test("client preview passes automated serious/critical WCAG checks", async ({ page }) => {
  await signIn(page, clientEmail);
  await page.goto("/chess-demo/client");
  await expect(page.getByRole("heading", { name: "Your CHESS client preview" }))
    .toBeVisible();
  await assertNoSeriousAxeViolations(page, "Client preview");
});

test("owner's eight-business demo passes automated serious/critical WCAG checks", async ({ page }) => {
  await signIn(page, ownerEmail);
  await page.goto("/app/overview");
  await page.goto("/app/demo");
  await expect(page.getByRole("article")).toHaveCount(8);
  await assertNoSeriousAxeViolations(page, "Owner demo tour");
});
