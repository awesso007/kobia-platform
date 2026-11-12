import AxeBuilder from "@axe-core/playwright";
import { clerk } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

const employeeEmail = process.env.CHESS_DEMO_EMPLOYEE_EMAIL;
const clientEmail = process.env.CHESS_DEMO_CLIENT_EMAIL;

async function signIn(page, email) {
  if (!email) throw new Error("A verified Clerk demo test email is required.");
  // Clerk's helper uses a test-only token and server-side sign-in token.
  await page.goto("/chess-demo/login");
  await clerk.signIn({ page, emailAddress: email });
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
  expect(
    blocking,
    surface + " has critical/serious automated accessibility violations",
  ).toEqual([]);
}

test("employee signs in and sees only assigned employee workspaces", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "My work" })).toBeVisible();

  await page.goto("/app/chess-desk");
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await expect(page.getByText(/Visible active business units:\s*1\./)).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Employee workspaces",
  })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "Owner and administrator workspaces",
  })).toHaveCount(0);

  await page.goto("/app/work-items");
  await expect(page.getByRole("heading", { name: "Employee work items" })).toBeVisible();
  await expect(page.getByText("Fictional employee browser acceptance task")).toBeVisible();
});

test("employee identity cannot open the client-only preview", async ({ page }) => {
  await signIn(page, employeeEmail);
  const response = await page.goto("/chess-demo/client");
  expect(response?.status()).toBe(404);
});

test("client signs in and sees only their own pending fictional disclosure", async ({ page }) => {
  await signIn(page, clientEmail);
  const response = await page.goto("/chess-demo/client");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", {
    name: "Your CHESS client preview",
  })).toBeVisible();
  await expect(page.getByText("Morgan Fictional (FICTIONAL)")).toBeVisible();
  await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", {
    name: "This preview cannot accept or withdraw consent",
  })).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("client identity cannot enter employee workspaces", async ({ page }) => {
  await signIn(page, clientEmail);
  await page.goto("/app/chess-desk");
  await expect(page.getByRole("alert")).toContainText(
    "An active CHESS tenant membership is required",
  );
});

test("employee service desk passes automated WCAG 2.1 A/AA axe checks", async ({ page }) => {
  await signIn(page, employeeEmail);
  await page.goto("/app/chess-desk");
  await expect(page.getByRole("heading", { name: "Service desk" })).toBeVisible();
  await assertNoSeriousAxeViolations(page, "Employee service desk");
});

test("client preview passes automated WCAG 2.1 A/AA axe checks", async ({ page }) => {
  await signIn(page, clientEmail);
  await page.goto("/chess-demo/client");
  await expect(page.getByRole("heading", {
    name: "Your CHESS client preview",
  })).toBeVisible();
  await assertNoSeriousAxeViolations(page, "Client preview");
});
