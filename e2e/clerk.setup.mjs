import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

setup.describe.configure({ mode: "serial" });

setup("obtain Clerk testing token for this development instance", async () => {
  await clerkSetup();
});
