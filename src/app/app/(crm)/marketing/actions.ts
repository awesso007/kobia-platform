"use server";

/*
 * Marketing server actions (Sprint 13). All DB access goes through
 * getTenantDb(). Each mutating action enforces requirePermission and dispatches
 * automations / reindexes search where relevant. Marketing entities are not CRM
 * audited entities (auditWrite only covers LEAD/DEAL/CONTACT/COMPANY) so we skip
 * auditWrite here by design, mirroring the Calendar and Tasks modules.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex, removeFromIndex } from "@/lib/search";
import { recalcSegment } from "@/lib/marketing/segments";
import { enqueueBroadcast } from "@/lib/marketing/broadcast";
import { enrollContacts } from "@/lib/marketing/campaign";

// ---------------------------------------------------------------- Segments

export type SegmentInput = {
  name: string;
  description?: string | null;
  entityType: "contact" | "lead";
  filterJson: unknown;
};

export async function createSegment(input: SegmentInput): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Segment name is required.");
  const { db } = getTenantDb();
  const seg = await db.segment.create({
    data: {
      name,
      description: input.description?.trim() || null,
      entityType: input.entityType as never,
      filterJson: (input.filterJson ?? { combinator: "AND", rows: [] }) as never,
    },
  });
  await recalcSegment(db, seg.id).catch(() => undefined);
  revalidatePath("/app/marketing/segments");
  return seg.id;
}

export async function updateSegment(id: string, input: SegmentInput): Promise<void> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Segment name is required.");
  const { db } = getTenantDb();
  await db.segment.update({
    where: { id },
    data: {
      name,
      description: input.description?.trim() || null,
      entityType: input.entityType as never,
      filterJson: (input.filterJson ?? { combinator: "AND", rows: [] }) as never,
    },
  });
  await recalcSegment(db, id).catch(() => undefined);
  revalidatePath("/app/marketing/segments");
  revalidatePath(`/app/marketing/segments/${id}`);
}

export async function deleteSegment(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.segment.delete({ where: { id } });
  revalidatePath("/app/marketing/segments");
}

/** Recompute the segment's cached recipient count and return it. */
export async function evaluateSegmentAction(id: string): Promise<number> {
  await requirePermission("record:read");
  const { db } = getTenantDb();
  const recipients = await recalcSegment(db, id);
  revalidatePath("/app/marketing/segments");
  revalidatePath(`/app/marketing/segments/${id}`);
  return recipients.length;
}

// ---------------------------------------------------------------- Broadcasts

export type BroadcastInput = {
  name: string;
  channel: "EMAIL" | "SMS";
  subject?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  fromNumber?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  segmentId?: string | null;
};

export async function createBroadcast(input: BroadcastInput): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Broadcast name is required.");
  const { db } = getTenantDb();
  const b = await db.broadcast.create({
    data: {
      name,
      channel: input.channel as never,
      subject: input.subject?.trim() || null,
      fromName: input.fromName?.trim() || null,
      fromEmail: input.fromEmail?.trim() || null,
      fromNumber: input.fromNumber?.trim() || null,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
      segmentId: input.segmentId || null,
      status: "DRAFT" as never,
    },
  });
  await reindex(db, "BROADCAST", b.id).catch(() => undefined);
  revalidatePath("/app/marketing/broadcasts");
  return b.id;
}

export async function updateBroadcast(id: string, input: BroadcastInput): Promise<void> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Broadcast name is required.");
  const { db } = getTenantDb();
  await db.broadcast.update({
    where: { id },
    data: {
      name,
      channel: input.channel as never,
      subject: input.subject?.trim() || null,
      fromName: input.fromName?.trim() || null,
      fromEmail: input.fromEmail?.trim() || null,
      fromNumber: input.fromNumber?.trim() || null,
      bodyHtml: input.bodyHtml ?? null,
      bodyText: input.bodyText ?? null,
      segmentId: input.segmentId || null,
    },
  });
  await reindex(db, "BROADCAST", id).catch(() => undefined);
  revalidatePath("/app/marketing/broadcasts");
  revalidatePath(`/app/marketing/broadcasts/${id}`);
}

export async function deleteBroadcast(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.broadcast.delete({ where: { id } });
  await removeFromIndex(db, "BROADCAST", id).catch(() => undefined);
  revalidatePath("/app/marketing/broadcasts");
}

/**
 * Schedule a broadcast: resolve recipients into PENDING rows and set the
 * broadcast SCHEDULED at scheduledAt (now or future). The broadcast-sender cron
 * processes it once scheduledAt passes.
 */
export async function sendBroadcastAction(id: string, scheduledAt?: string): Promise<{ recipients: number; skippedUnsub: number }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const when = scheduledAt ? new Date(scheduledAt) : new Date();
  const res = await enqueueBroadcast(db, id, when);
  if (!res.ok) throw new Error(res.error ?? "Could not schedule broadcast.");
  await dispatchAutomation({ type: "RECORD_UPDATED", entityType: "CONTACT", entityId: id, changedFields: ["broadcast"] }).catch(() => undefined);
  revalidatePath("/app/marketing/broadcasts");
  revalidatePath(`/app/marketing/broadcasts/${id}`);
  return { recipients: res.recipients, skippedUnsub: res.skippedUnsub };
}

// ---------------------------------------------------------------- Campaigns

export type CampaignStepInput = {
  type: "EMAIL" | "SMS" | "WAIT" | "CONDITION" | "TAG" | "WEBHOOK";
  config: Record<string, unknown>;
};

export type CampaignInput = {
  name: string;
  description?: string | null;
  triggerType: "MANUAL" | "SEGMENT_ENTRY" | "TAG_ADDED" | "FORM_SUBMITTED";
  triggerConfigJson?: unknown;
  segmentId?: string | null;
  steps: CampaignStepInput[];
};

async function writeSteps(db: ReturnType<typeof getTenantDb>["db"], campaignId: string, steps: CampaignStepInput[]): Promise<void> {
  await db.campaignStep.deleteMany({ where: { campaignId } });
  if (steps.length === 0) return;
  await db.campaignStep.createMany({
    data: steps.map((s, i) => ({
      campaignId,
      order: i,
      type: s.type as never,
      config: (s.config ?? {}) as never,
    })),
  });
}

export async function createCampaign(input: CampaignInput): Promise<string> {
  await requirePermission("record:create");
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required.");
  const { db } = getTenantDb();
  const c = await db.campaign.create({
    data: {
      name,
      description: input.description?.trim() || null,
      status: "DRAFT" as never,
      triggerType: input.triggerType as never,
      triggerConfigJson: (input.triggerConfigJson ?? {}) as never,
      segmentId: input.segmentId || null,
    },
  });
  await writeSteps(db, c.id, input.steps ?? []);
  revalidatePath("/app/marketing/campaigns");
  return c.id;
}

export async function updateCampaign(id: string, input: CampaignInput): Promise<void> {
  await requirePermission("record:update");
  const name = input.name?.trim();
  if (!name) throw new Error("Campaign name is required.");
  const { db } = getTenantDb();
  await db.campaign.update({
    where: { id },
    data: {
      name,
      description: input.description?.trim() || null,
      triggerType: input.triggerType as never,
      triggerConfigJson: (input.triggerConfigJson ?? {}) as never,
      segmentId: input.segmentId || null,
    },
  });
  await writeSteps(db, id, input.steps ?? []);
  revalidatePath("/app/marketing/campaigns");
  revalidatePath(`/app/marketing/campaigns/${id}`);
}

export async function deleteCampaign(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.campaign.delete({ where: { id } });
  revalidatePath("/app/marketing/campaigns");
}

/**
 * Activate a campaign. Sets status ACTIVE and, when the campaign has a segment,
 * enrolls that segment's current members at the first step (the campaign-runner
 * cron then walks each enrollment). Returns the number of new enrollments.
 */
export async function activateCampaignAction(id: string): Promise<{ enrolled: number }> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw new Error("Campaign not found.");

  await db.campaign.update({ where: { id }, data: { status: "ACTIVE" as never } });

  let enrolled = 0;
  if (campaign.segmentId) {
    const { recalcSegment } = await import("@/lib/marketing/segments");
    const recipients = await recalcSegment(db, campaign.segmentId);
    const entities = recipients.map((r) => ({ entityType: r.entityType, id: r.id }));
    enrolled = await enrollContacts(db, id, entities);
  }
  revalidatePath("/app/marketing/campaigns");
  revalidatePath(`/app/marketing/campaigns/${id}`);
  return { enrolled };
}

export async function setCampaignStatusAction(id: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED" | "DRAFT"): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.campaign.update({ where: { id }, data: { status: status as never } });
  revalidatePath("/app/marketing/campaigns");
  revalidatePath(`/app/marketing/campaigns/${id}`);
}

// ---------------------------------------------------------------- Landing pages

export type LandingPageInput = {
  slug: string;
  title: string;
  htmlContent: string;
  cssContent?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImage?: string | null;
  formId?: string | null;
};

function sanitizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export async function createLandingPage(input: LandingPageInput): Promise<string> {
  await requirePermission("record:create");
  const title = input.title?.trim();
  if (!title) throw new Error("Page title is required.");
  const slug = sanitizeSlug(input.slug || title);
  if (!slug) throw new Error("A valid slug is required.");
  const { db } = getTenantDb();
  const existing = await db.landingPage.findUnique({ where: { slug }, select: { id: true } });
  if (existing) throw new Error(`A landing page with slug "${slug}" already exists.`);
  const page = await db.landingPage.create({
    data: {
      slug,
      title,
      htmlContent: input.htmlContent ?? "",
      cssContent: input.cssContent ?? null,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      ogImage: input.ogImage?.trim() || null,
      formId: input.formId || null,
      status: "DRAFT" as never,
    },
  });
  await reindex(db, "LANDING_PAGE", page.id).catch(() => undefined);
  revalidatePath("/app/marketing/landing-pages");
  return page.id;
}

export async function updateLandingPage(id: string, input: LandingPageInput): Promise<void> {
  await requirePermission("record:update");
  const title = input.title?.trim();
  if (!title) throw new Error("Page title is required.");
  const slug = sanitizeSlug(input.slug || title);
  if (!slug) throw new Error("A valid slug is required.");
  const { db } = getTenantDb();
  const clash = await db.landingPage.findFirst({ where: { slug, NOT: { id } }, select: { id: true } });
  if (clash) throw new Error(`A landing page with slug "${slug}" already exists.`);
  await db.landingPage.update({
    where: { id },
    data: {
      slug,
      title,
      htmlContent: input.htmlContent ?? "",
      cssContent: input.cssContent ?? null,
      metaTitle: input.metaTitle?.trim() || null,
      metaDescription: input.metaDescription?.trim() || null,
      ogImage: input.ogImage?.trim() || null,
      formId: input.formId || null,
    },
  });
  await reindex(db, "LANDING_PAGE", id).catch(() => undefined);
  revalidatePath("/app/marketing/landing-pages");
  revalidatePath(`/app/marketing/landing-pages/${id}`);
}

export async function deleteLandingPage(id: string): Promise<void> {
  await requirePermission("record:delete");
  const { db } = getTenantDb();
  await db.landingPage.delete({ where: { id } });
  await removeFromIndex(db, "LANDING_PAGE", id).catch(() => undefined);
  revalidatePath("/app/marketing/landing-pages");
}

/** Toggle a landing page between PUBLISHED and DRAFT. */
export async function publishLandingPageAction(id: string, publish: boolean): Promise<void> {
  await requirePermission("record:update");
  const { db } = getTenantDb();
  await db.landingPage.update({
    where: { id },
    data: {
      status: (publish ? "PUBLISHED" : "DRAFT") as never,
      publishedAt: publish ? new Date() : null,
    },
  });
  await reindex(db, "LANDING_PAGE", id).catch(() => undefined);
  revalidatePath("/app/marketing/landing-pages");
  revalidatePath(`/app/marketing/landing-pages/${id}`);
}
