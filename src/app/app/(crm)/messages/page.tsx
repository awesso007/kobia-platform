import { listThreads } from "../sms-actions";
import { MessagesClient } from "./MessagesClient";
import { isConfigured } from "@/lib/telephony/twilio";
import { NoTenantError } from "@/lib/db/get-tenant-db";
import { CrmError } from "../CrmError";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  try {
    const threads = await listThreads();
    return <MessagesClient threads={threads} configured={isConfigured()} />;
  } catch (err) {
    if (err instanceof NoTenantError) return <CrmError />;
    throw err;
  }
}
