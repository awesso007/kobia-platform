import { notFound } from "next/navigation";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../CrmError";
import { getQuoteBuilder } from "../queries";
import { QuoteBuilder } from "./QuoteBuilder";

export const dynamic = "force-dynamic";

export default async function QuoteBuilderPage({ params }: { params: { id: string } }) {
  try {
    const data = await getQuoteBuilder(params.id);
    if (!data) notFound();
    return <QuoteBuilder data={data} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
