/*
 * Global keyboard shortcut definitions (Sprint 9). Shared between the global
 * handler (KeyboardShortcuts) and the read-only reference at
 * /app/settings/keyboard.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
export type Shortcut = { keys: string; description: string };

export type ShortcutGroup = { title: string; shortcuts: Shortcut[] };

/* g-then-letter navigation targets (the "go to" leader sequence). */
export const GO_TO_ROUTES: Record<string, string> = {
  l: "/app/leads",
  d: "/app/deals",
  c: "/app/contacts",
  o: "/app/companies",
  a: "/app/activities",
  r: "/app/reports",
};

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: "Cmd K / Ctrl K", description: "Open search" },
      { keys: "Esc", description: "Close modal or record panel" },
    ],
  },
  {
    title: "Go to",
    shortcuts: [
      { keys: "g then l", description: "Leads" },
      { keys: "g then d", description: "Deals" },
      { keys: "g then c", description: "Contacts" },
      { keys: "g then o", description: "Companies" },
      { keys: "g then a", description: "Activities" },
      { keys: "g then r", description: "Reports" },
    ],
  },
  {
    title: "List pages",
    shortcuts: [
      { keys: "n", description: "Create a new record" },
      { keys: "/", description: "Focus the inline search box" },
    ],
  },
];
