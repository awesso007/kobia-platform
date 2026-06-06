/*
 * Custom report builder page (Sprint 4). Loads an existing SavedReport when
 * ?id= is present (edit mode); otherwise starts from the empty definition.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getSavedReport } from "../queries";
import { BuilderClient } from "./BuilderClient";
import { EMPTY_DEFINITION } from "@/lib/reports/types";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";

export const dynamic = "force-dynamic";

export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const id = (Array.isArray(searchParams.id) ? searchParams.id[0] : searchParams.id) as string | undefined;
  try {
    const existing = id ? await getSavedReport(id) : null;
    return (
      <BuilderClient
        reportId={existing?.id ?? null}
        initialName={existing?.name ?? ""}
        initialDefinition={existing?.definition ?? EMPTY_DEFINITION}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
