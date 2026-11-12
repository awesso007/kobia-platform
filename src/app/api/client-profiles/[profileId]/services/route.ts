import {withAlreadyAuditedHistoricalGet} from "@/lib/chess/historical-get-response-audit";
import {assertMutationOrigin} from "@/lib/chess/request-security";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { PermissionError } from "@/lib/rbac/require-permission";
import { getClientProfile, getClientServiceLink, createClientServiceLink } from "@/lib/client-profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const service = z.enum(["ACCOUNTING", "BOOKKEEPING", "PAYROLL", "TAX", "MORTGAGE", "INSURANCE", "REAL_ESTATE", "INVESTMENTS"]);
const input = z.object({ service, businessId: z.string().min(1).max(128) }).strict();
type Context = { params: { profileId: string } };

function failure(error: unknown) {
  if (error instanceof PermissionError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid service input" }, { status: 400 });
  return NextResponse.json({ error: "Unable to process client service" }, { status: 500 });
}

async function historicalAuditedGet(request: NextRequest, { params }: Context) {
  try {
    const profile = await getClientProfile(params.profileId);
    const requestedService = service.parse(request.nextUrl.searchParams.get("service"));
    const businessId = z.string().min(1).max(128).parse(request.nextUrl.searchParams.get("businessId"));
    const link = await getClientServiceLink(profile.id, businessId, requestedService);
    return NextResponse.json({ link });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
 try { assertMutationOrigin(request);
    const body = input.parse(await request.json());
    const link = await createClientServiceLink(params.profileId, body.businessId, body.service);
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export const GET=withAlreadyAuditedHistoricalGet("client-profiles/[profileId]/services",historicalAuditedGet);
