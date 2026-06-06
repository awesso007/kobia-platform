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
  { key: "activities", label: "Activities", href: "/app/activities", icon: Activity },
  { key: "messages", label: "Messages", href: "/app/messages", icon: MessageSquare },
  { key: "files", label: "Files", href: "/app/files", icon: FolderOpen },
  { key: "automations", label: "Automations", href: "/app/automations", icon: Workflow },
  { key: "reports", label: "Reports", href: "/app/reports", icon: BarChart3 },
  { key: "settings", label: "Settings", href: "/app/settings", icon: Settings },
];
