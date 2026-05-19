"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { getActiveEntity } from "@/lib/active-entity";
import {
  createDraftMileage,
  postMileage,
  voidMileage,
} from "@/lib/accounting/mileage";

export async function createMileageAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const tripDate = new Date(String(formData.get("tripDate") || ""));
  const miles = Number(formData.get("miles") || 0);
  const ratePerMileCents = Number(formData.get("ratePerMileCents") || 70);
  const businessPercent = Number(formData.get("businessPercent") || 100);
  const fromAddress = String(formData.get("fromAddress") || "") || null;
  const toAddress = String(formData.get("toAddress") || "") || null;
  const purpose = String(formData.get("purpose") || "") || null;
  const andPost = formData.get("andPost") === "1";

  if (!tenantSlug || !miles || isNaN(tripDate.getTime())) {
    throw new Error("Missing tenantSlug, tripDate, or miles");
  }

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");

  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  const m = await createDraftMileage({
    tenantId: auth.tenant.id,
    entityId: entity.id,
    tripDate,
    miles,
    ratePerMileCents,
    businessPercent,
    fromAddress,
    toAddress,
    purpose,
    createdByUserId: auth.user.id,
  });

  if (andPost) {
    await postMileage({
      mileageId: m.id,
      tenantId: auth.tenant.id,
      entityId: entity.id,
      postedByUserId: auth.user.id,
    });
  }

  revalidatePath(`/${tenantSlug}/books/mileage`);
  redirect(`/${tenantSlug}/books/mileage`);
}

export async function postMileageAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const mileageId = String(formData.get("mileageId") || "");
  if (!tenantSlug || !mileageId) throw new Error("Missing tenantSlug or mileageId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  await postMileage({
    mileageId,
    tenantId: auth.tenant.id,
    entityId: entity.id,
    postedByUserId: auth.user.id,
  });
  revalidatePath(`/${tenantSlug}/books/mileage`);
}

export async function voidMileageAction(formData: FormData): Promise<void> {
  const tenantSlug = String(formData.get("tenantSlug") || "");
  const mileageId = String(formData.get("mileageId") || "");
  if (!tenantSlug || !mileageId) throw new Error("Missing tenantSlug or mileageId");

  const auth = await getAuthContext(tenantSlug);
  if (!auth) throw new Error("Unauthorized");
  const entity = await getActiveEntity({ tenantId: auth.tenant.id, tenantSlug });
  if (!entity) throw new Error("No active entity");

  await voidMileage({ mileageId, tenantId: auth.tenant.id, entityId: entity.id });
  revalidatePath(`/${tenantSlug}/books/mileage`);
}
