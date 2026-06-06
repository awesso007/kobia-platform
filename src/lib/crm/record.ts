/*
 * Shared CRM record types. A "record" is one of the four CRM entities the
 * RecordPane can mount against. CrmActivity stores a nullable FK per type
 * (leadId / dealId / contactId / companyId), so we map a record type to its
 * column here in one place.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type RecordType = "lead" | "deal" | "contact" | "company";

export const ACTIVITY_FK_BY_TYPE: Record<RecordType, "leadId" | "dealId" | "contactId" | "companyId"> = {
  lead: "leadId",
  deal: "dealId",
  contact: "contactId",
  company: "companyId",
};

export const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "MEETING", "TASK"] as const;
export type ActivityKind = (typeof ACTIVITY_TYPES)[number];

export type ActivityRow = {
  id: string;
  type: ActivityKind;
  subject: string;
  body: string | null;
  occurredAt: string;
  createdByUserId: string | null;
};
