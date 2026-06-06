/*
 * Broadcast detail / edit page (Sprint 13).
 * No em-dashes in copy by project convention (use hyphens).
 */
import { notFound } from "next/navigation";
import { getBroadcast, listSegmentsLite } from "../../queries";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../../../CrmError";
import { BroadcastEditor } from "../BroadcastEditor";

export const dynamic = "force-dynamic";

export default async function BroadcastDetailPage({ params }: { params: { id: string } }) {
  try {
    const [broadcast, segments] = await Promise.all([getBroadcast(params.id), listSegmentsLite()]);
    if (!broadcast) notFound();
    return (
      <BroadcastEditor
        segments={segments}
        broadcast={{
          id: broadcast.id,
          name: broadcast.name,
          channel: broadcast.channel,
          subject: broadcast.subject,
          fromName: broadcast.fromName,
          fromEmail: broadcast.fromEmail,
          fromNumber: broadcast.fromNumber,
          bodyHtml: broadcast.bodyHtml,
          bodyText: broadcast.bodyText,
          segmentId: broadcast.segmentId,
          status: broadcast.status,
          statsJson: broadcast.statsJson,
        }}
      />
    );
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
