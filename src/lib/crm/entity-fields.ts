/*
 * Static field catalog for the five CRM entities. Drives the condition rows and
 * field pickers in the Automations builder and the Reports builder. "system"
 * fields are the columns on the Prisma model; custom fields are merged in at
 * runtime by the callers that have a tenant context.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import type { AutomationEntityKind } from "@/lib/automations/types";

export type FieldKind = "text" | "number" | "date" | "boolean" | "enum";

export type EntityField = {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
};

export const ENTITY_FIELDS: Record<AutomationEntityKind, EntityField[]> = {
  LEAD: [
    { key: "name", label: "Name", kind: "text" },
    { key: "companyName", label: "Company name", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "source", label: "Source", kind: "enum", options: ["WEBSITE", "REFERRAL", "CALL", "EMAIL", "EVENT", "OTHER"] },
    { key: "status", label: "Status", kind: "enum", options: ["NEW", "CONTACTED", "QUALIFIED", "UNQUALIFIED", "CONVERTED"] },
    { key: "ownerUserId", label: "Owner", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  DEAL: [
    { key: "name", label: "Name", kind: "text" },
    { key: "amountCents", label: "Amount (cents)", kind: "number" },
    { key: "probabilityPct", label: "Probability %", kind: "number" },
    { key: "status", label: "Status", kind: "enum", options: ["OPEN", "WON", "LOST"] },
    { key: "stageId", label: "Stage", kind: "text" },
    { key: "ownerUserId", label: "Owner", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  CONTACT: [
    { key: "firstName", label: "First name", kind: "text" },
    { key: "lastName", label: "Last name", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "phone", label: "Phone", kind: "text" },
    { key: "title", label: "Title", kind: "text" },
    { key: "ownerUserId", label: "Owner", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  COMPANY: [
    { key: "name", label: "Name", kind: "text" },
    { key: "domain", label: "Domain", kind: "text" },
    { key: "industry", label: "Industry", kind: "text" },
    { key: "size", label: "Size", kind: "enum", options: ["SIZE_1_10", "SIZE_11_50", "SIZE_51_200", "SIZE_201_1000", "SIZE_1000_PLUS"] },
    { key: "ownerUserId", label: "Owner", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  ACTIVITY: [
    { key: "type", label: "Type", kind: "enum", options: ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] },
    { key: "subject", label: "Subject", kind: "text" },
    { key: "dueAt", label: "Due", kind: "date" },
    { key: "completedAt", label: "Completed", kind: "date" },
    { key: "ownerClerkUserId", label: "Owner", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  TASK: [
    { key: "title", label: "Title", kind: "text" },
    { key: "status", label: "Status", kind: "enum", options: ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED", "CANCELED"] },
    { key: "priority", label: "Priority", kind: "enum", options: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    { key: "assigneeClerkUserId", label: "Assignee", kind: "text" },
    { key: "dueAt", label: "Due", kind: "date" },
    { key: "progressPct", label: "Progress %", kind: "number" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  PROJECT: [
    { key: "name", label: "Name", kind: "text" },
    { key: "key", label: "Key", kind: "text" },
    { key: "status", label: "Status", kind: "enum", options: ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] },
    { key: "ownerClerkUserId", label: "Owner", kind: "text" },
    { key: "startDate", label: "Start", kind: "date" },
    { key: "endDate", label: "End", kind: "date" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  EVENT: [
    { key: "title", label: "Title", kind: "text" },
    { key: "location", label: "Location", kind: "text" },
    { key: "status", label: "Status", kind: "enum", options: ["CONFIRMED", "TENTATIVE", "CANCELED"] },
    { key: "startAt", label: "Start", kind: "date" },
    { key: "endAt", label: "End", kind: "date" },
    { key: "organizerClerkUserId", label: "Organizer", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  BOOKING: [
    { key: "inviteeName", label: "Invitee name", kind: "text" },
    { key: "inviteeEmail", label: "Invitee email", kind: "text" },
    { key: "inviteePhone", label: "Invitee phone", kind: "text" },
    { key: "status", label: "Status", kind: "enum", options: ["PENDING", "CONFIRMED", "CANCELED", "RESCHEDULED"] },
    { key: "startAt", label: "Start", kind: "date" },
    { key: "endAt", label: "End", kind: "date" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  TICKET: [
    { key: "subject", label: "Subject", kind: "text" },
    { key: "status", label: "Status", kind: "enum", options: ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] },
    { key: "priority", label: "Priority", kind: "enum", options: ["LOW", "NORMAL", "HIGH", "URGENT"] },
    { key: "channel", label: "Channel", kind: "enum", options: ["EMAIL", "PORTAL", "PHONE", "CHAT", "MANUAL"] },
    { key: "requesterEmail", label: "Requester email", kind: "text" },
    { key: "assigneeId", label: "Assignee", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
  CHAT_MESSAGE: [
    { key: "authorName", label: "Author", kind: "text" },
    { key: "authorId", label: "Author id", kind: "text" },
    { key: "bodyText", label: "Body", kind: "text" },
    { key: "channelId", label: "Channel id", kind: "text" },
    { key: "createdAt", label: "Created", kind: "date" },
  ],
};
