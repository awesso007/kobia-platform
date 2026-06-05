/*
 * Shared placeholder for CRM sections not yet built. Renders a Bitrix24-style
 * page header (title + breadcrumb) and an empty-state card noting the sprint
 * the feature is planned for.
 */
export function StubPage({
  title,
  sprint,
  description,
}: {
  title: string;
  sprint: string;
  description?: string;
}) {
  return (
    <div>
      <div className="mb-4 text-xs" style={{ color: "var(--kb-text-secondary)" }}>
        CRM / {title}
      </div>
      <h1
        className="mb-6"
        style={{
          fontSize: "var(--kb-fs-h1)",
          fontWeight: 600,
          color: "var(--kb-text-primary)",
        }}
      >
        {title}
      </h1>

      <div
        className="grid place-items-center p-16 text-center"
        style={{
          backgroundColor: "var(--kb-surface)",
          border: "1px dashed var(--kb-border)",
          borderRadius: "var(--kb-radius)",
          boxShadow: "var(--kb-shadow-card)",
        }}
      >
        <p style={{ fontWeight: 600, color: "var(--kb-text-primary)" }}>
          Coming in {sprint}
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
          {description ?? "This section is scaffolded but not yet built."}
        </p>
      </div>
    </div>
  );
}
