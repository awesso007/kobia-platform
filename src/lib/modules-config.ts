import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Home,
  HomeIcon,
  Landmark,
  LayoutDashboard,
  Lock,
  Package,
  Receipt,
  Scale,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type { ModuleKey } from "./active-module";

/** A single nav item — leaf link or dropdown row */
export type TabItem = {
  href: string; // relative to tenant base — leading slash, no tenant prefix
  label: string;
  icon?: LucideIcon;
  badge?: string; // "Soon" | "Beta"
};

/** A top-tab — either a direct link or a dropdown */
export type TopTab = {
  label: string;
  /** When set: clicking the tab navigates here directly (no dropdown) */
  href?: string;
  /** When set: tab is a dropdown with these grouped items */
  groups?: Array<{
    label?: string; // optional section label inside dropdown
    items: TabItem[];
  }>;
  badge?: string;
};

/** Legacy NavGroup kept for any consumer still using sidebar groups */
export type NavGroup = {
  label: string;
  items: TabItem[];
};

export type ModuleDefinition = {
  key: ModuleKey;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
  /** Bitrix-style top tabs */
  topTabs: TopTab[];
  /** Default landing page when this module is opened */
  defaultHref: string;
  /** Legacy left-sidebar groups (still used as fallback for narrow viewports) */
  groups: NavGroup[];
  comingSoon?: boolean;
};

export const MODULES: ModuleDefinition[] = [
  {
    key: "accounting",
    label: "Accounting",
    icon: BookOpen,
    defaultHref: "/dashboard",
    topTabs: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Activity", href: "/inbox" },
      {
        label: "Books",
        groups: [
          {
            items: [
              { href: "/books", label: "Chart of Accounts", icon: BookOpen },
              { href: "/books/journal", label: "Journal", icon: FileText },
              { href: "/books/recurring-jes", label: "Recurring Entries", icon: FileText },
              { href: "/books/assets", label: "Fixed Assets", icon: Wallet },
              { href: "/books/close", label: "Period Close", icon: Lock },
            ],
          },
        ],
      },
      {
        label: "Customers",
        groups: [
          {
            items: [
              { href: "/ar/customers", label: "Customers", icon: Users },
              { href: "/ar/invoices", label: "Invoices", icon: FileText },
              { href: "/ar/statements", label: "Statements", icon: Receipt },
              { href: "/settings/tax-rates", label: "Sales Tax Rates", icon: Receipt },
            ],
          },
        ],
      },
      {
        label: "Vendors",
        groups: [
          {
            items: [
              { href: "/ap/vendors", label: "Vendors", icon: Users },
              { href: "/ap/bills", label: "Bills", icon: Receipt },
              { href: "/ap/expenses", label: "Expenses", icon: CreditCard },
              { href: "/ap/portal", label: "Vendor Portal", icon: ShieldCheck },
              { href: "/tax/1099", label: "1099-NEC", icon: ClipboardList },
              { href: "/tax/1099-misc", label: "1099-MISC", icon: ClipboardList },
              { href: "/tax-filings", label: "Tax Filing Tracker", icon: ClipboardList },
            ],
          },
        ],
      },
      { label: "Banking", href: "/bank" },
      {
        label: "Items",
        groups: [
          {
            items: [
              { href: "/items", label: "Catalog", icon: Package },
              { href: "/items/movements", label: "Inventory Movements", icon: Boxes },
            ],
          },
        ],
      },
      {
        label: "Payroll",
        groups: [
          {
            items: [
              { href: "/payroll", label: "Pay Runs", icon: DollarSign },
              { href: "/payroll/employees", label: "Employees", icon: Users },
              { href: "/payroll/taxes", label: "Withholding & Filings", icon: ClipboardList },
            ],
          },
        ],
      },
      {
        label: "Practice",
        groups: [
          {
            items: [
              { href: "/practice", label: "Engagements", icon: Briefcase },
              { href: "/practice/recurring", label: "Recurring", icon: Briefcase },
              { href: "/practice/tasks", label: "My Tasks", icon: ClipboardList },
              { href: "/practice/letters", label: "Letters", icon: ClipboardList },
              { href: "/practice/templates", label: "Templates", icon: ClipboardList },
              { href: "/practice/clients", label: "Portal users", icon: ClipboardList },
              { href: "/practice/requests", label: "Doc requests", icon: ClipboardList },
              { href: "/time", label: "Time tracker", icon: ClipboardList },
              { href: "/time/rates", label: "Billing rates", icon: DollarSign },
              { href: "/workflows", label: "Workflows", icon: Zap },
              { href: "/vault", label: "Document Vault", icon: FileText },
              { href: "/communications", label: "Communications", icon: FileText },
            ],
          },
        ],
      },
      {
        label: "CRM",
        groups: [
          {
            items: [
              { href: "/crm", label: "Pipeline", icon: TrendingUp },
              { href: "/crm/leads", label: "Leads", icon: Users },
            ],
          },
        ],
      },
      {
        label: "Reports",
        groups: [
          {
            items: [
              { href: "/reports", label: "All Reports (Hub)", icon: BarChart3 },
            ],
          },
          {
            label: "Financials",
            items: [
              { href: "/books/reports/pnl", label: "Profit & Loss", icon: BarChart3 },
              { href: "/books/reports/balance-sheet", label: "Balance Sheet", icon: BarChart3 },
              { href: "/books/reports/cash-flow", label: "Cash Flow", icon: BarChart3 },
              { href: "/books/reports/trial-balance", label: "Trial Balance", icon: BarChart3 },
              { href: "/books/reports/general-ledger", label: "General Ledger", icon: BarChart3 },
            ],
          },
          {
            label: "Aging & A/R",
            items: [
              { href: "/books/reports/ar-aging", label: "A/R Aging", icon: BarChart3 },
              { href: "/books/reports/ap-aging", label: "A/P Aging", icon: BarChart3 },
            ],
          },
          {
            label: "Performance",
            items: [
              { href: "/books/reports/saas-metrics", label: "SaaS Metrics", icon: TrendingUp },
              { href: "/books/reports/class-pnl", label: "Class P&L", icon: BarChart3 },
              { href: "/books/reports/budget", label: "Budget vs Actual", icon: BarChart3 },
            ],
          },
        ],
      },
      {
        label: "Settings",
        groups: [
          {
            items: [
              { href: "/settings", label: "General", icon: Settings },
              { href: "/settings/currencies", label: "Currencies", icon: DollarSign },
              { href: "/settings/tax-rates", label: "Tax Rates", icon: Receipt },
              { href: "/settings/approvals", label: "Approvals", icon: ShieldCheck },
              { href: "/settings/billing", label: "Billing", icon: CreditCard },
            ],
          },
        ],
      },
    ],
    // Legacy fallback (used by mobile / narrow viewports if added later)
    groups: [
      {
        label: "Quick links",
        items: [
          { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { href: "/books", label: "Chart of Accounts", icon: BookOpen },
          { href: "/ar/invoices", label: "Invoices", icon: FileText },
          { href: "/ap/bills", label: "Bills", icon: Receipt },
          { href: "/bank", label: "Banking", icon: Landmark },
        ],
      },
    ],
  },
  {
    key: "mortgage",
    label: "Mortgage",
    icon: HomeIcon,
    comingSoon: true,
    defaultHref: "/mortgage",
    topTabs: [
      { label: "Pipeline", href: "/mortgage" },
      {
        label: "Origination",
        groups: [
          {
            items: [
              { href: "/mortgage/loans", label: "Loans", icon: FileText, badge: "Soon" },
              { href: "/mortgage/borrowers", label: "Borrowers", icon: Users, badge: "Soon" },
            ],
          },
        ],
      },
      {
        label: "Compliance",
        groups: [
          {
            items: [
              { href: "/mortgage/compliance", label: "RESPA / TRID", icon: ShieldCheck, badge: "Soon" },
            ],
          },
        ],
      },
    ],
    groups: [
      {
        label: "Origination",
        items: [
          { href: "/mortgage", label: "Pipeline", icon: ClipboardList, badge: "Soon" },
          { href: "/mortgage/loans", label: "Loans", icon: FileText, badge: "Soon" },
          { href: "/mortgage/borrowers", label: "Borrowers", icon: Users, badge: "Soon" },
        ],
      },
    ],
  },
  {
    key: "realestate",
    label: "Real Estate",
    icon: Building2,
    comingSoon: true,
    defaultHref: "/realestate",
    topTabs: [
      { label: "Listings", href: "/realestate" },
      {
        label: "Transactions",
        groups: [
          {
            items: [
              { href: "/realestate/transactions", label: "Transactions", icon: FileText, badge: "Soon" },
              { href: "/realestate/commissions", label: "Commissions", icon: Wallet, badge: "Soon" },
            ],
          },
        ],
      },
      {
        label: "Compliance",
        groups: [
          {
            items: [
              { href: "/realestate/compliance", label: "DRE / NMLS", icon: Scale, badge: "Soon" },
            ],
          },
        ],
      },
    ],
    groups: [
      {
        label: "Brokerage",
        items: [
          { href: "/realestate", label: "Listings", icon: Building2, badge: "Soon" },
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

/** Backwards-compat shim — legacy Home import used by some routes */
export { Home };
