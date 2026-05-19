import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  DollarSign,
  FileText,
  Home,
  HomeIcon,
  Landmark,
  Lock,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { ModuleKey } from "./active-module";

export type NavItem = {
  href: string; // relative to tenant base — leading slash, no tenant prefix
  label: string;
  icon: LucideIcon;
  badge?: string; // e.g. "Soon"
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  shortLabel?: string;
  groups: NavGroup[];
  comingSoon?: boolean; // module visible but locked
};

export const MODULES: ModuleDefinition[] = [
  {
    key: "accounting",
    label: "Accounting",
    icon: BookOpen,
    groups: [
      {
        label: "Overview",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: Home },
        ],
      },
      {
        label: "Books",
        items: [
          { href: "/books", label: "Chart of Accounts", icon: BookOpen },
          { href: "/books/journal", label: "Journal", icon: FileText },
          { href: "/books/close", label: "Period Close", icon: Lock },
        ],
      },
      {
        label: "Reports",
        items: [
          { href: "/books/reports/pnl", label: "P&L", icon: BarChart3 },
          { href: "/books/reports/balance-sheet", label: "Balance Sheet", icon: BarChart3 },
          { href: "/books/reports/cash-flow", label: "Cash Flow", icon: BarChart3 },
          { href: "/books/reports/ar-aging", label: "AR Aging", icon: BarChart3 },
          { href: "/books/reports/ap-aging", label: "AP Aging", icon: BarChart3 },
        ],
      },
      {
        label: "Receivables",
        items: [
          { href: "/ar/customers", label: "Customers", icon: Users },
          { href: "/ar/invoices", label: "Invoices", icon: FileText },
        ],
      },
      {
        label: "Payables",
        items: [
          { href: "/ap/vendors", label: "Vendors", icon: Users },
          { href: "/ap/bills", label: "Bills", icon: Receipt },
        ],
      },
      {
        label: "Banking",
        items: [
          { href: "/bank", label: "Bank & Reconcile", icon: Landmark },
        ],
      },
      {
        label: "Payroll",
        items: [
          { href: "/payroll", label: "Payroll", icon: DollarSign, badge: "Soon" },
        ],
      },
      {
        label: "Tax",
        items: [
          { href: "/tax/1099", label: "1099 Prep", icon: ClipboardList, badge: "Beta" },
        ],
      },
      {
        label: "Settings",
        items: [
          { href: "/settings", label: "Settings", icon: Settings },
        ],
      },
    ],
  },
  {
    key: "mortgage",
    label: "Mortgage",
    icon: HomeIcon,
    comingSoon: true,
    groups: [
      {
        label: "Origination",
        items: [
          { href: "/mortgage", label: "Pipeline", icon: ClipboardList, badge: "Soon" },
          { href: "/mortgage/loans", label: "Loans", icon: FileText, badge: "Soon" },
          { href: "/mortgage/borrowers", label: "Borrowers", icon: Users, badge: "Soon" },
        ],
      },
      {
        label: "Compliance",
        items: [
          { href: "/mortgage/compliance", label: "RESPA / TRID", icon: ShieldCheck, badge: "Soon" },
        ],
      },
    ],
  },
  {
    key: "realestate",
    label: "Real Estate",
    icon: Building2,
    comingSoon: true,
    groups: [
      {
        label: "Brokerage",
        items: [
          { href: "/realestate", label: "Listings", icon: Building2, badge: "Soon" },
          { href: "/realestate/transactions", label: "Transactions", icon: FileText, badge: "Soon" },
          { href: "/realestate/commissions", label: "Commissions", icon: Wallet, badge: "Soon" },
        ],
      },
      {
        label: "Compliance",
        items: [
          { href: "/realestate/compliance", label: "DRE / NMLS", icon: Scale, badge: "Soon" },
        ],
      },
    ],
  },
];

export function getModuleByKey(key: ModuleKey): ModuleDefinition {
  return MODULES.find((m) => m.key === key) ?? MODULES[0]!;
}

/**
 * Infer which module a given path belongs to. Path is the part AFTER the tenant slug,
 * e.g. "/ar/invoices" or "/books/reports/pnl".
 */
export function inferModuleFromPath(pathAfterTenant: string): ModuleKey {
  const p = pathAfterTenant.startsWith("/") ? pathAfterTenant : `/${pathAfterTenant}`;
  if (p.startsWith("/mortgage")) return "mortgage";
  if (p.startsWith("/realestate")) return "realestate";
  return "accounting";
}
