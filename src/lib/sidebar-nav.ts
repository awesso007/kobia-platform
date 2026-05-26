/**
 * Flat sidebar nav — Bitrix24-style left rail.
 * One icon + label per row, full list of top-level destinations.
 */
import {
  LayoutDashboard,
  Users,
  Receipt,
  FileText,
  Wallet,
  CreditCard,
  Package,
  DollarSign,
  Briefcase,
  TrendingUp,
  BarChart3,
  ClipboardList,
  Zap,
  BookOpen,
  Settings,
  Inbox,
  Building2,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SidebarItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export type SidebarSection = {
  label?: string;
  items: SidebarItem[];
};

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Activity", href: "/inbox", icon: Inbox },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Customers", href: "/ar/customers", icon: Users },
      { label: "Invoices", href: "/ar/invoices", icon: FileText },
      { label: "Statements", href: "/ar/statements", icon: Receipt },
      { label: "CRM Pipeline", href: "/crm", icon: TrendingUp },
      { label: "Leads", href: "/crm/leads", icon: Users },
    ],
  },
  {
    label: "Purchases",
    items: [
      { label: "Vendors", href: "/ap/vendors", icon: Users },
      { label: "Bills", href: "/ap/bills", icon: Receipt },
      { label: "1099-NEC", href: "/tax/1099", icon: ClipboardList },
      { label: "Tax Filings", href: "/tax-filings", icon: ClipboardList },
    ],
  },
  {
    label: "Books",
    items: [
      { label: "Chart of Accounts", href: "/books", icon: BookOpen },
      { label: "Journal", href: "/books/journal", icon: FileText },
      { label: "Fixed Assets", href: "/books/assets", icon: Wallet },
      { label: "Period Close", href: "/books/close", icon: Lock },
      { label: "Banking", href: "/bank", icon: CreditCard },
      { label: "Items", href: "/items", icon: Package },
    ],
  },
  {
    label: "Payroll",
    items: [
      { label: "Pay Runs", href: "/payroll", icon: DollarSign },
      { label: "Employees", href: "/payroll/employees", icon: Users },
      { label: "Forms (W-2, 941, 940)", href: "/payroll/forms", icon: ClipboardList },
    ],
  },
  {
    label: "Practice",
    items: [
      { label: "Engagements", href: "/practice", icon: Briefcase },
      { label: "Time Tracker", href: "/time", icon: ClipboardList },
      { label: "Workflows", href: "/workflows", icon: Zap },
      { label: "Document Vault", href: "/vault", icon: FileText },
      { label: "Communications", href: "/communications", icon: FileText },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    items: [
      { label: "Entities", href: "/entities/new", icon: Building2 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];
