import "@/styles/tokens.css";
import { CrmSidebar } from "./CrmSidebar";
import { CrmTopBar } from "./CrmTopBar";

/*
 * CRM shell layout (v0.1). Two-zone Bitrix24 layout: dark left rail + light
 * content area with a top bar. Scoped under .kobia-crm so design tokens do not
 * leak into the legacy accounting shell.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kobia-crm flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: "var(--kb-page-bg)" }}
    >
      <CrmSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <CrmTopBar />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
