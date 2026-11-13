import {assertMutationOrigin} from "@/lib/chess/request-security";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { PermissionError } from "@/lib/rbac/require-permission";
import { revokeClientServiceGrant, setClientServiceGrant } from "@/lib/client-profile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  clerkUserId: z.string().min(1).max(128),
  canRead: z.boolean(),
  canWrite: z.boolean(),
}).strict();

type Context = { params: { linkId: string } };
function failure(error: unknown) {
  if (error instanceof PermissionError) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid grant input" }, { status: 400 });
  return NextResponse.json({ error: "Unable to process access grant" }, { status: 500 });
}

/** OWNER/ADMIN only, explicit per-service grant. */
export async function PUT(request: NextRequest, { params }: Context) {
 try { assertMutationOrigin(request);
    const { clerkUserId, canRead, canWrite } = bodySchema.parse(await request.json());
    const grant = await setClientServiceGrant(params.linkId, clerkUserId, { canRead, canWrite });
    return NextResponse.json({ grant });
  } catch (error) {
    return failure(error);
  }
}

/** Revoke, never delete, so the access decision defaults to denied. */
export async function DELETE(request: NextRequest, { params }: Context) {
 try { assertMutationOrigin(request);
    const body: unknown = await request.json();
    const clerkUserId = z.object({clerkUserId:z.string().min(1).max(128)}).strict().parse(body).clerkUserId;
    const result = await revokeClientServiceGrant(params.linkId, clerkUserId);
    return NextResponse.json({ revoked: result.count > 0 });
  } catch (error) {
    return failure(error);
  }
}
