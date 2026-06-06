import { SettingsNav } from "../SettingsNav";
import { SHORTCUT_GROUPS } from "@/lib/crm/shortcuts";

export const dynamic = "force-dynamic";

/*
 * Keyboard shortcuts reference (Sprint 9). Read-only listing of every global
 * shortcut, grouped. The shortcuts themselves are handled by the global
 * KeyboardShortcuts component and the command palette; this page just documents
 * them.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export default function KeyboardSettingsPage() {
  return (
    <div>
      <div className="mb-1 text-xs" style={{ color: "var(--kb-text-secondary)" }}>CRM / Settings</div>
      <h1 className="mb-4" style={{ fontSize: "var(--kb-fs-h1)", fontWeight: 600, color: "var(--kb-text-primary)" }}>Settings</h1>
      <SettingsNav />

      <p className="mb-5 text-sm" style={{ color: "var(--kb-text-secondary)" }}>
        Keyboard shortcuts available throughout the app. These are read-only.
      </p>

      <div className="grid gap-5" style={{ maxWidth: 640 }}>
        {SHORTCUT_GROUPS.map((group) => (
          <section
            key={group.title}
            style={{
              backgroundColor: "var(--kb-surface)",
              border: "1px solid var(--kb-border)",
              borderRadius: "var(--kb-radius)",
              boxShadow: "var(--kb-shadow-card)",
            }}
          >
            <h2
              className="px-4 py-2 text-sm font-semibold"
              style={{ color: "var(--kb-text-primary)", borderBottom: "1px solid var(--kb-border)" }}
            >
              {group.title}
            </h2>
            <ul>
              {group.shortcuts.map((s) => (
                <li
                  key={s.keys}
                  className="flex items-center justify-between gap-4 px-4 py-2 text-sm"
                  style={{ borderTop: "1px solid var(--kb-border)" }}
                >
                  <span style={{ color: "var(--kb-text-primary)" }}>{s.description}</span>
                  <kbd
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor: "var(--kb-surface-grey)",
                      border: "1px solid var(--kb-border)",
                      color: "var(--kb-text-secondary)",
                    }}
                  >
                    {s.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
