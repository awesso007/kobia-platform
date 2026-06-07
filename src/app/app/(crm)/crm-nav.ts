/*
 * CRM sidebar navigation config. Sprint 1: all sections are stubs.
 * Icons reference lucide-react names (already a dependency).
 */
import type { LucideIcon } from "lucide-react";
import {
  Users,
  Handshake,
  Contact,
  Building2,
  Activity,
  Workflow,
  BarChart3,
  MessageSquare,
  FolderOpen,
  FileText,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  Megaphone,
  Settings,
} from "lucide-react";

export type CrmNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const crmNav: CrmNavItem[] = [
  { key: "leads", label: "Leads", href: "/app/leads", icon: Users },
  { key: "deals", label: "Deals", href: "/app/deals", icon: Handshake },
  { key: "contacts", label: "Contacts", href: "/app/contacts", icon: Contact },
  { key: "companies", label: "Companies", href: "/app/companies", icon: Building2 },
  { key: "projects", label: "Projects", href: "/app/projects", icon: FolderKanban },
  { key: "tasks", label: "My Tasks", href: "/app/tasks", icon: CheckSquare },
  { key: "calendar", label: "Calendar", href: "/app/calendar", icon: CalendarDays },
  { key: "activities", label: "Activities", href: "/app/activities", icon: Activity },
  { key: "messages", label: "Messages", href: "/app/messages", icon: MessageSquare },
  { key: "files", label: "Files", href: "/app/files", icon: FolderOpen },
  { key: "documents", label: "Documents", href: "/app/documents", icon: FileText },
  { key: "marketing", label: "Marketing", href: "/app/marketing", icon: Megaphone },
  { key: "automations", label: "Automations", href: "/app/automations", icon: Workflow },
  { key: "reports", label: "Reports", href: "/app/reports", icon: BarChart3 },
  { key: "settings", label: "Settings", href: "/app/settings", icon: Settings },
];
