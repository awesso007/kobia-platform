import { NextResponse } from "next/server";
import { setActiveModule, type ModuleKey } from "@/lib/active-module";

const VALID: ModuleKey[] = ["accounting", "mortgage", "realestate"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    module?: string;
    tenantSlug?: string;
  };
  if (!body.tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }
  if (!body.module || !VALID.includes(body.module as ModuleKey)) {
    return NextResponse.json({ error: "invalid module" }, { status: 400 });
  }
  await setActiveModule(body.tenantSlug, body.module as ModuleKey);
  return NextResponse.json({ ok: true });
}
