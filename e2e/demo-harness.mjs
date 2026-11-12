/**
 * Pure fail-closed preflight for browser-only CHESS demos. Runs before
 * Playwright launches any browser or connects to Clerk. This is NOT a
 * production auth substitute and must never mint fictional sessions.
 */
export function assertSafeChessDemoBrowserEnvironment(env, baseURL) {
  if (env.NODE_ENV !== "development" ||
      env.CHESS_DEMO_MODE !== "true" ||
      env.NEXT_PUBLIC_DEFAULT_TENANT !== "chess-demo") {
    throw new Error("Browser acceptance requires an isolated development CHESS demo.");
  }
  if (!env.CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
      !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") ||
      env.CLERK_PUBLISHABLE_KEY !== env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      !env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Browser acceptance requires one Clerk development/test instance.");
  }
  let db;
  try { db = new URL(env.DATABASE_URL); }
  catch { throw new Error("Browser acceptance requires the isolated Neon chess_demo database."); }
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname.endsWith(".neon.tech") ||
      db.hostname.split(".")[0].endsWith("-pooler") ||
      decodeURIComponent(db.pathname.slice(1)) !== "chess_demo" ||
      db.searchParams.get("sslmode") !== "require" ||
      !db.username || !db.password ||
      (env.DIRECT_URL && env.DIRECT_URL !== env.DATABASE_URL)) {
    throw new Error("Browser acceptance refuses any non-demo, pooled, or non-TLS database.");
  }
  let target;
  try { target = new URL(baseURL); }
  catch { throw new Error("Browser acceptance needs a local HTTP server."); }
  if (target.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.port !== "3000" || target.pathname !== "/" ||
      target.search || target.hash || target.username || target.password) {
    throw new Error("Browser acceptance refuses a remote or non-local server.");
  }
  const emails = ["OWNER", "EMPLOYEE", "CLIENT"].map(role => {
    const email = env["CHESS_DEMO_" + role + "_EMAIL"]?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.endsWith(".invalid")) {
      throw new Error("Each signed-in demo role needs a distinct verified Clerk test email.");
    }
    return email;
  });
  if (new Set(emails).size !== emails.length) {
    throw new Error("Demo owner, employee, and client test identities must be distinct.");
  }
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("CHESS_") &&
        /(?:ENABLED|APPROVED|CERTIFIED)$/.test(name) &&
        value === "true") {
      throw new Error("Browser acceptance refuses enabled financial or regulated features.");
    }
  }
  return { baseURL: target.origin };
}
