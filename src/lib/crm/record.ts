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

/** CrmEntityType enum value (DB) for a RecordType. Used by tags, custom fields, audit. */
export type EntityType = "LEAD" | "DEAL" | "CONTACT" | "COMPANY";

export const ENTITY_TYPE_BY_RECORD: Record<RecordType, EntityType> = {
  lead: "LEAD",
  deal: "DEAL",
  contact: "CONTACT",
  company: "COMPANY",
};

export const RECORD_BY_ENTITY_TYPE: Record<EntityType, RecordType> = {
  LEAD: "lead",
  DEAL: "deal",
  CONTACT: "contact",
  COMPANY: "company",
};

export const ENTITY_TYPES = ["LEAD", "DEAL", "CONTACT", "COMPANY"] as const;

export const CUSTOM_FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
  "SELECT",
  "MULTI_SELECT",
  "URL",
  "EMAIL",
  "PHONE",
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export type CustomFieldDef = {
  id: string;
  entityType: EntityType;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[] | null;
  required: boolean;
  order: number;
};

/** A custom field value keyed by field id, ready for form state. value is the raw JSON. */
export type CustomFieldValueMap = Record<string, unknown>;

export type TagRow = {
  id: string;
  name: string;
  color: string;
};

/** Company size buckets: DB enum value -> display label. */
export const COMPANY_SIZES = [
  { value: "SIZE_1_10", label: "1-10" },
  { value: "SIZE_11_50", label: "11-50" },
  { value: "SIZE_51_200", label: "51-200" },
  { value: "SIZE_201_1000", label: "201-1000" },
  { value: "SIZE_1000_PLUS", label: "1000+" },
] as const;

export type CompanySizeValue = (typeof COMPANY_SIZES)[number]["value"];

export function companySizeLabel(value: string | null | undefined): string {
  return COMPANY_SIZES.find((s) => s.value === value)?.label ?? "-";
}

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
