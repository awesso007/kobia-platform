import {withAuditedHistoricalGet} from "@/lib/chess/historical-get-response-audit";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { PermissionError } from "@/lib/rbac/require-permission";
import { createClientProfile, listClientProfiles } from "@/lib/client-profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown) {
  if (error instanceof PermissionError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid client profile input" }, { status: 400 });
  return NextResponse.json({ error: "Unable to process client profiles" }, { status: 500 });
}

async function historicalAuditedGet() {
  try {
    return NextResponse.json({ profiles: await listClientProfiles() });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
 try { assertMutationOrigin(request);
    const body: unknown = await request.json();
    const profile = await createClientProfile(body);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export const GET=withAuditedHistoricalGet("client-profiles",historicalAuditedGet);
