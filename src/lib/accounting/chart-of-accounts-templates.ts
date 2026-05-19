/**
 * Chart of Accounts templates (Cycle 2).
 * GAAP-aligned, industry-default starting structures.
 *
 * Codes follow standard convention:
 *   1000-1999  Assets
 *   2000-2999  Liabilities
 *   3000-3999  Equity
 *   4000-4999  Revenue
 *   5000-5999  COGS
 *   6000-7999  Operating Expenses
 *   8000-8999  Other Income
 *   9000-9999  Other Expense
 */
import type { AccountType } from "@prisma/client";

export type AccountTemplate = {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  isSystem?: boolean;
  parentCode?: string;
  description?: string;
};

/** Universal base — every entity gets these regardless of industry. */
export const UNIVERSAL_ACCOUNTS: AccountTemplate[] = [
  // Assets
  { code: "1000", name: "Cash and Cash Equivalents", type: "ASSET", subtype: "Bank", description: "Operating bank accounts" },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", subtype: "Accounts Receivable", isSystem: true },
  { code: "1200", name: "Inventory", type: "ASSET", subtype: "Inventory" },
  { code: "1300", name: "Prepaid Expenses", type: "ASSET", subtype: "Other Current Asset" },
  { code: "1500", name: "Property, Plant & Equipment", type: "ASSET", subtype: "Fixed Asset" },
  { code: "1510", name: "Accumulated Depreciation", type: "ASSET", subtype: "Fixed Asset", description: "Contra-asset" },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "LIABILITY", subtype: "Accounts Payable", isSystem: true },
  { code: "2100", name: "Credit Cards", type: "LIABILITY", subtype: "Credit Card" },
  { code: "2200", name: "Sales Tax Payable", type: "LIABILITY", subtype: "Tax Liability" },
  { code: "2300", name: "Payroll Liabilities", type: "LIABILITY", subtype: "Payroll Liability" },
  { code: "2400", name: "Accrued Expenses", type: "LIABILITY", subtype: "Other Current Liability" },
  { code: "2700", name: "Long-Term Debt", type: "LIABILITY", subtype: "Long Term Liability" },
  // Equity
  { code: "3000", name: "Owner's Equity / Common Stock", type: "EQUITY", subtype: "Equity" },
  { code: "3100", name: "Owner's Draw / Distributions", type: "EQUITY", subtype: "Equity" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY", subtype: "Retained Earnings", isSystem: true, description: "System-managed; closes on year-end" },
  // Revenue
  { code: "4000", name: "Sales Revenue", type: "REVENUE", subtype: "Income" },
  { code: "4900", name: "Discounts Given", type: "REVENUE", subtype: "Income", description: "Contra-revenue" },
  // COGS
  { code: "5000", name: "Cost of Goods Sold", type: "COGS", subtype: "Cost of Goods Sold" },
  // Operating Expenses
  { code: "6000", name: "Salaries and Wages", type: "EXPENSE", subtype: "Payroll Expense" },
  { code: "6100", name: "Payroll Taxes", type: "EXPENSE", subtype: "Payroll Expense" },
  { code: "6200", name: "Employee Benefits", type: "EXPENSE", subtype: "Payroll Expense" },
  { code: "6300", name: "Rent Expense", type: "EXPENSE", subtype: "Occupancy" },
  { code: "6400", name: "Utilities", type: "EXPENSE", subtype: "Occupancy" },
  { code: "6500", name: "Office Supplies", type: "EXPENSE", subtype: "Office" },
  { code: "6600", name: "Software & Subscriptions", type: "EXPENSE", subtype: "Office" },
  { code: "6700", name: "Marketing & Advertising", type: "EXPENSE", subtype: "Marketing" },
  { code: "6800", name: "Professional Fees", type: "EXPENSE", subtype: "Professional Services" },
  { code: "6900", name: "Insurance", type: "EXPENSE", subtype: "Insurance" },
  { code: "7000", name: "Travel & Entertainment", type: "EXPENSE", subtype: "Travel" },
  { code: "7100", name: "Vehicle Expense", type: "EXPENSE", subtype: "Vehicle" },
  { code: "7200", name: "Depreciation Expense", type: "EXPENSE", subtype: "Depreciation" },
  { code: "7300", name: "Bank Fees", type: "EXPENSE", subtype: "Bank Charges" },
  { code: "7400", name: "Interest Expense", type: "EXPENSE", subtype: "Interest" },
  { code: "7999", name: "Other Operating Expense", type: "EXPENSE", subtype: "Other" },
  // Other Income / Expense
  { code: "8000", name: "Interest Income", type: "OTHER_INCOME", subtype: "Other Income" },
  { code: "9000", name: "Income Tax Expense", type: "OTHER_EXPENSE", subtype: "Tax" },
];

/** Industry-specific add-ons. Merged with UNIVERSAL_ACCOUNTS. */
export const INDUSTRY_ADDONS: Record<string, AccountTemplate[]> = {
  PROFESSIONAL_SERVICES: [
    { code: "4100", name: "Consulting Revenue", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Retainer Revenue", type: "REVENUE", subtype: "Income" },
    { code: "1400", name: "Unbilled Revenue / WIP", type: "ASSET", subtype: "Other Current Asset" },
  ],
  RETAIL: [
    { code: "4100", name: "Product Sales", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Shipping Revenue", type: "REVENUE", subtype: "Income" },
    { code: "1210", name: "Inventory in Transit", type: "ASSET", subtype: "Inventory" },
    { code: "5100", name: "Freight In", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5200", name: "Inventory Adjustments", type: "COGS", subtype: "Cost of Goods Sold" },
  ],
  REAL_ESTATE: [
    { code: "4100", name: "Rental Income", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Commission Income", type: "REVENUE", subtype: "Income" },
    { code: "1700", name: "Real Estate Held for Sale", type: "ASSET", subtype: "Other Asset" },
    { code: "6310", name: "Property Management Fees", type: "EXPENSE", subtype: "Occupancy" },
    { code: "6320", name: "HOA Fees", type: "EXPENSE", subtype: "Occupancy" },
    { code: "7110", name: "Repairs & Maintenance", type: "EXPENSE", subtype: "Maintenance" },
  ],
  RESTAURANT: [
    { code: "4100", name: "Food Sales", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Beverage Sales", type: "REVENUE", subtype: "Income" },
    { code: "4300", name: "Tips Received", type: "REVENUE", subtype: "Income" },
    { code: "5100", name: "Food Cost", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5200", name: "Beverage Cost", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "6010", name: "Tips Paid Out", type: "EXPENSE", subtype: "Payroll Expense" },
  ],
  CONSTRUCTION: [
    { code: "4100", name: "Construction Revenue", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Change Order Revenue", type: "REVENUE", subtype: "Income" },
    { code: "1400", name: "Costs in Excess of Billings (WIP)", type: "ASSET", subtype: "Other Current Asset" },
    { code: "2500", name: "Billings in Excess of Costs", type: "LIABILITY", subtype: "Other Current Liability" },
    { code: "5100", name: "Job Materials", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5200", name: "Subcontractor Costs", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5300", name: "Job Labor", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5400", name: "Equipment Rental (job)", type: "COGS", subtype: "Cost of Goods Sold" },
  ],
  SAAS: [
    { code: "4100", name: "Subscription Revenue", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Implementation Revenue", type: "REVENUE", subtype: "Income" },
    { code: "2600", name: "Deferred Revenue", type: "LIABILITY", subtype: "Other Current Liability" },
    { code: "5100", name: "Hosting & Infrastructure", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5200", name: "Third-Party API Costs", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "5300", name: "Customer Success Salaries (COGS portion)", type: "COGS", subtype: "Cost of Goods Sold" },
  ],
  HEALTHCARE: [
    { code: "4100", name: "Patient Service Revenue", type: "REVENUE", subtype: "Income" },
    { code: "4200", name: "Insurance Reimbursement", type: "REVENUE", subtype: "Income" },
    { code: "4900", name: "Contractual Adjustments", type: "REVENUE", subtype: "Income", description: "Contra-revenue" },
    { code: "1110", name: "AR - Patient", type: "ASSET", subtype: "Accounts Receivable" },
    { code: "1120", name: "AR - Insurance", type: "ASSET", subtype: "Accounts Receivable" },
    { code: "5100", name: "Medical Supplies", type: "COGS", subtype: "Cost of Goods Sold" },
    { code: "6810", name: "Malpractice Insurance", type: "EXPENSE", subtype: "Insurance" },
  ],
};

export const SUPPORTED_INDUSTRIES = Object.keys(INDUSTRY_ADDONS);

/** Build the full chart for a given industry. */
export function buildChartTemplate(industry?: string | null): AccountTemplate[] {
  const addons = industry && INDUSTRY_ADDONS[industry] ? INDUSTRY_ADDONS[industry] : [];
  // Merge: industry-specific overrides universal if same code.
  const map = new Map<string, AccountTemplate>();
  for (const a of UNIVERSAL_ACCOUNTS) map.set(a.code, a);
  for (const a of addons) map.set(a.code, a);
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}
