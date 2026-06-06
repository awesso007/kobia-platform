/*
 * Search indexer (Sprint 9). Maintains the per-tenant SearchIndex table that
 * backs the Cmd+K command palette. After every CRUD on an indexable entity, the
 * server action calls reindex(entityType, entityId) which loads the row, derives
 * title/subtitle/body, and upserts the SearchIndex row. The tsv column is a
 * generated STORED column (see migration 0009_search) so we never write it from
 * app code - Postgres keeps it in sync on every upsert.
 *
 * removeFromIndex is called on deletes. Both helpers are defensive: they never
 * throw, so a search-index hiccup can never break a CRUD path.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";

export type IndexEntityType =
  | "LEAD"
  | "DEAL"
  | "CONTACT"
  | "COMPANY"
  | "ACTIVITY"
  | "FILE"
  | "EMAIL_MESSAGE"
  | "NOTE"
  | "TASK"
  | "PROJECT"
  | "TASK_COMMENT"
  | "EVENT"
  | "BOOKING_PAGE"
  | "LANDING_PAGE"
  | "BROADCAST";

type IndexDoc = {
  title: string;
  subtitle: string | null;
  body: string | null;
  ownerClerkUserId: string | null;
};

function join(...parts: Array<string | null | undefined>): string | null {
  const out = parts.filter((p) => p != null && p !== "").join(" ");
  return out.length ? out : null;
}

/** Build the searchable document for an entity, or null if the row is gone. */
async function buildDoc(
  db: PrismaClient,
  entityType: IndexEntityType,
  entityId: string,
): Promise<IndexDoc | null> {
  switch (entityType) {
    case "LEAD": {
      const r = await db.lead.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: r.companyName ?? null,
        body: join(r.email, r.phone, r.notes),
        ownerClerkUserId: r.ownerUserId ?? null,
      };
    }
    case "DEAL": {
      const r = await db.deal.findUnique({
        where: { id: entityId },
        include: { stage: true, company: true },
      });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: join(r.stage?.name, r.company?.name),
        body: r.notes ?? null,
        ownerClerkUserId: r.ownerUserId ?? null,
      };
    }
    case "CONTACT": {
      const r = await db.contact.findUnique({
        where: { id: entityId },
        include: { company: true },
      });
      if (!r) return null;
      return {
        title: join(r.firstName, r.lastName) ?? r.firstName,
        subtitle: join(r.title, r.company?.name),
        body: join(r.email, r.phone),
        ownerClerkUserId: r.ownerUserId ?? null,
      };
    }
    case "COMPANY": {
      const r = await db.company.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: r.industry ?? null,
        body: join(r.domain, r.website, r.phone),
        ownerClerkUserId: r.ownerUserId ?? null,
      };
    }
    case "ACTIVITY":
    case "NOTE": {
      const r = await db.crmActivity.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.subject,
        subtitle: r.type,
        body: r.body ?? null,
        ownerClerkUserId: r.ownerClerkUserId ?? null,
      };
    }
    case "FILE": {
      const r = await db.file.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: r.mimeType,
        body: null,
        ownerClerkUserId: r.uploadedByClerkUserId ?? null,
      };
    }
    case "EMAIL_MESSAGE": {
      const r = await db.emailMessage.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.subject ?? "(no subject)",
        subtitle: r.fromAddress,
        body: r.snippet ?? r.bodyText ?? null,
        ownerClerkUserId: null,
      };
    }
    case "TASK": {
      const r = await db.task.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.title,
        subtitle: r.status,
        body: r.description ?? null,
        ownerClerkUserId: r.assigneeClerkUserId ?? r.reporterClerkUserId ?? null,
      };
    }
    case "PROJECT": {
      const r = await db.project.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: r.key,
        body: r.description ?? null,
        ownerClerkUserId: r.ownerClerkUserId ?? null,
      };
    }
    case "TASK_COMMENT": {
      const r = await db.taskComment.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.body.slice(0, 80),
        subtitle: null,
        body: r.body,
        ownerClerkUserId: r.clerkUserId ?? null,
      };
    }
    case "EVENT": {
      const r = await db.calendarEvent.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.title,
        subtitle: r.location ?? null,
        body: join(r.description, r.locationUrl),
        ownerClerkUserId: r.organizerClerkUserId ?? null,
      };
    }
    case "BOOKING_PAGE": {
      const r = await db.bookingPage.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: `/book/${r.slug}`,
        body: r.description ?? null,
        ownerClerkUserId: r.ownerClerkUserId ?? null,
      };
    }
    case "LANDING_PAGE": {
      const r = await db.landingPage.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.title,
        subtitle: `/p/${r.slug}`,
        body: join(r.metaTitle, r.metaDescription),
        ownerClerkUserId: r.createdById ?? null,
      };
    }
    case "BROADCAST": {
      const r = await db.broadcast.findUnique({ where: { id: entityId } });
      if (!r) return null;
      return {
        title: r.name,
        subtitle: r.channel,
        body: r.subject ?? null,
        ownerClerkUserId: r.createdById ?? null,
      };
    }
    default:
      return null;
  }
}

/**
 * Upsert the SearchIndex row for one entity. If the entity no longer exists,
 * its index row is removed instead. Never throws.
 */
export async function reindex(
  db: PrismaClient,
  entityType: IndexEntityType,
  entityId: string,
): Promise<void> {
  try {
    const doc = await buildDoc(db, entityType, entityId);
    if (!doc) {
      await removeFromIndex(db, entityType, entityId);
      return;
    }
    await db.searchIndex.upsert({
      where: { entityType_entityId: { entityType, entityId } },
      create: {
        entityType,
        entityId,
        title: doc.title,
        subtitle: doc.subtitle,
        body: doc.body,
        ownerClerkUserId: doc.ownerClerkUserId,
      },
      update: {
        title: doc.title,
        subtitle: doc.subtitle,
        body: doc.body,
        ownerClerkUserId: doc.ownerClerkUserId,
      },
    });
  } catch (err) {
    console.error(`[search] reindex failed for ${entityType}:${entityId}`, err);
  }
}

/** Remove an entity's SearchIndex row. Never throws. */
export async function removeFromIndex(
  db: PrismaClient,
  entityType: IndexEntityType,
  entityId: string,
): Promise<void> {
  try {
    await db.searchIndex.deleteMany({ where: { entityType, entityId } });
  } catch (err) {
    console.error(`[search] removeFromIndex failed for ${entityType}:${entityId}`, err);
  }
}
