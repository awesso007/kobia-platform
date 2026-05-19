/**
 * Tier definitions — single source of truth for marketing copy + feature gates.
 * Pricing aligns with Lock locks for FREE/ENTRY brand show, SOLO+ brand hide.
 */
import type { TenantTier } from "@prisma/client";

export type FeatureKey =
  | "accounting"
  | "ar"
  | "ap"
  | "bank_rec"
  | "payroll"
  | "tax_1099"
  | "mortgage"
  | "realestate"
  | "white_label"
  | "multi_entity"
  | "api_access";

export type TierDefinition = {
  key: TenantTier;
  label: string;
  price: number | null; // monthly USD, null = custom
  priceLabel: string;
  tagline: string;
  audience: string;
  highlights: string[];
  features: Partial<Record<FeatureKey, boolean | number>>; // true = unlimited, number = limit
  cta: string;
  recommended?: boolean;
};

export const TIERS: TierDefinition[] = [
  {
    key: "FREE",
    label: "Starter",
    price: 0,
    priceLabel: "Free",
    tagline: "Try KOBIA with one entity.",
    audience: "Solo business owner exploring the platform",
    highlights: [
      "1 entity",
      "Full accounting (P&L, BS, Cash Flow)",
      "AR + AP + Bank reconciliation",
      "1099 prep",
      "Powered by KOBIA badge",
    ],
    features: {
      accounting: true,
      ar: true,
      ap: true,
      bank_rec: true,
      tax_1099: true,
      multi_entity: 1,
      payroll: false,
      mortgage: false,
      realestate: false,
      white_label: false,
      api_access: false,
    },
    cta: "Get started free",
  },
  {
    key: "SOLO",
    label: "Solo",
    price: 149,
    priceLabel: "$149/mo",
    tagline: "Your own brand. Your own books.",
    audience: "Solo accountant or single business",
    highlights: [
      "Up to 3 entities",
      "Everything in Starter",
      "Payroll (when launched)",
      "White-label (remove KOBIA badge)",
      "Custom logo + colors",
    ],
    features: {
      accounting: true,
      ar: true,
      ap: true,
      bank_rec: true,
      tax_1099: true,
      payroll: true,
      multi_entity: 3,
      white_label: true,
      mortgage: false,
      realestate: false,
      api_access: false,
    },
    cta: "Start Solo",
    recommended: true,
  },
  {
    key: "FIRM",
    label: "Firm",
    price: 399,
    priceLabel: "$399/mo",
    tagline: "Built for accounting firms.",
    audience: "Small firms managing multiple client books",
    highlights: [
      "Up to 25 entities",
      "Everything in Solo",
      "Mortgage module access",
      "Real Estate module access",
      "Custom domain",
      "Priority support",
    ],
    features: {
      accounting: true,
      ar: true,
      ap: true,
      bank_rec: true,
      tax_1099: true,
      payroll: true,
      multi_entity: 25,
      white_label: true,
      mortgage: true,
      realestate: true,
      api_access: false,
    },
    cta: "Start Firm",
  },
  {
    key: "FIRM_PLUS",
    label: "Firm+",
    price: 899,
    priceLabel: "$899/mo",
    tagline: "Scale without limits.",
    audience: "Growing firms + multi-state operators",
    highlights: [
      "Unlimited entities",
      "Everything in Firm",
      "API access",
      "Dedicated account manager",
      "SSO / SAML",
    ],
    features: {
      accounting: true,
      ar: true,
      ap: true,
      bank_rec: true,
      tax_1099: true,
      payroll: true,
      multi_entity: true,
      white_label: true,
      mortgage: true,
      realestate: true,
      api_access: true,
    },
    cta: "Start Firm+",
  },
];

export function getTier(key: TenantTier): TierDefinition | null {
  return TIERS.find((t) => t.key === key) ?? null;
}

/**
 * Check whether a tenant on `tier` can access `feature`.
 * Returns true/false; for numeric limits, caller checks count vs. limit separately.
 */
export function tierHasFeature(tier: TenantTier, feature: FeatureKey): boolean {
  // Internal + Enterprise: unlock everything.
  if (tier === "INTERNAL" || tier === "ENTERPRISE") return true;
  const def = getTier(tier);
  if (!def) return false;
  const val = def.features[feature];
  return val === true || (typeof val === "number" && val > 0);
}

/**
 * Numeric limit for a feature (e.g. multi_entity = 3 means 3 entities allowed).
 * Returns Infinity if unlimited, 0 if blocked.
 */
export function tierLimit(tier: TenantTier, feature: FeatureKey): number {
  if (tier === "INTERNAL" || tier === "ENTERPRISE") return Infinity;
  const def = getTier(tier);
  if (!def) return 0;
  const val = def.features[feature];
  if (val === true) return Infinity;
  if (typeof val === "number") return val;
  return 0;
}

/** Paid tiers that go through Stripe Checkout. */
export const PAID_TIERS = ["SOLO", "FIRM", "FIRM_PLUS"] as const;
export type PaidTier = (typeof PAID_TIERS)[number];
export function isPaidTier(key: TenantTier): key is PaidTier {
  return (PAID_TIERS as readonly string[]).includes(key);
}
