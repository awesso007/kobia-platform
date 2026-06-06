import { getTenantDb, NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { SettingsNav } from "../SettingsNav";
import { CustomFieldsManager } from "./CustomFieldsManager";
import { ENTITY_TYPES, type CustomFieldDef, type EntityType } from "@/lib/crm/record";

export const dynamic = "force-dynamic";

function toOptions(raw: unknown): string[] | null {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  return null;
}

export default async function CustomFieldsPage() {
  try {
    const { db } = getTenantDb();
    const fields = await db.customField.findMany({
      orderBy: [{ entityType: "asc" }, { order: "asc" }, { createdAt: "asc" }],
    });

    const byEntity: Record<EntityType, CustomFieldDef[]> = {
      LEAD: [],
      DEAL: [],
      CONTACT: [],
      COMPANY: [],
    };
    for (const f of fields) {
      const et = f.entityType as EntityType;
      if (!ENTITY_TYPES.includes(et)) continue;
      byEntity[et].push({
        id: f.id,
        entityType: et,
        key: f.key,
        label: f.label,
        type: f.type as CustomFieldDef["type"],
        options: toOptions(f.options),
        required: f.required,
        order: f.order,
      });
    }

    return (
      <div>
        <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
        <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
        <SettingsNav />
        <CustomFieldsManager byEntity={byEntity} />
      </div>
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
