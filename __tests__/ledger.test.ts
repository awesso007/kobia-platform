/**
 * Ledger engine unit tests — pure functions only, no DB.
 */
import { describe, it, expect } from "vitest";
import { validateEntry, normalBalanceSign, formatCents, LedgerError } from "@/lib/accounting/ledger";
import { buildChartTemplate, UNIVERSAL_ACCOUNTS } from "@/lib/accounting/chart-of-accounts-templates";

describe("normalBalanceSign", () => {
  it("returns +1 for debit-normal types", () => {
    expect(normalBalanceSign("ASSET")).toBe(1);
    expect(normalBalanceSign("EXPENSE")).toBe(1);
    expect(normalBalanceSign("COGS")).toBe(1);
    expect(normalBalanceSign("OTHER_EXPENSE")).toBe(1);
  });
  it("returns -1 for credit-normal types", () => {
    expect(normalBalanceSign("LIABILITY")).toBe(-1);
    expect(normalBalanceSign("EQUITY")).toBe(-1);
    expect(normalBalanceSign("REVENUE")).toBe(-1);
    expect(normalBalanceSign("OTHER_INCOME")).toBe(-1);
  });
});

describe("formatCents", () => {
  it("formats positive amounts", () => {
    expect(formatCents(123456n)).toBe("$1,234.56");
    expect(formatCents(0n)).toBe("$0.00");
    expect(formatCents(99n)).toBe("$0.99");
  });
  it("formats negative amounts in parens", () => {
    expect(formatCents(-50000n)).toBe("($500.00)");
  });
  it("handles large amounts", () => {
    expect(formatCents(100000000n)).toBe("$1,000,000.00");
  });
});

describe("validateEntry", () => {
  const draftBase = {
    tenantId: "t1",
    entityId: "e1",
    entryDate: new Date(),
  };

  it("accepts a balanced entry", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: 10000n, creditCents: 0n },
          { accountId: "a2", debitCents: 0n, creditCents: 10000n },
        ],
      })
    ).not.toThrow();
  });

  it("rejects entries with fewer than 2 lines", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [{ accountId: "a1", debitCents: 10000n, creditCents: 0n }],
      })
    ).toThrow(LedgerError);
  });

  it("rejects unbalanced entries", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: 10000n, creditCents: 0n },
          { accountId: "a2", debitCents: 0n, creditCents: 9999n },
        ],
      })
    ).toThrow(/UNBALANCED|not balanced/i);
  });

  it("rejects negative amounts", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: -100n, creditCents: 0n },
          { accountId: "a2", debitCents: 0n, creditCents: -100n },
        ],
      })
    ).toThrow(/non-negative/);
  });

  it("rejects lines with both debit and credit", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: 100n, creditCents: 100n },
          { accountId: "a2", debitCents: 0n, creditCents: 0n },
        ],
      })
    ).toThrow(/both debit and credit/);
  });

  it("rejects all-zero lines", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: 0n, creditCents: 0n },
          { accountId: "a2", debitCents: 0n, creditCents: 0n },
        ],
      })
    ).toThrow(/non-zero/);
  });

  it("accepts complex multi-line balanced entries", () => {
    expect(() =>
      validateEntry({
        ...draftBase,
        lines: [
          { accountId: "a1", debitCents: 50000n, creditCents: 0n },
          { accountId: "a2", debitCents: 30000n, creditCents: 0n },
          { accountId: "a3", debitCents: 0n, creditCents: 70000n },
          { accountId: "a4", debitCents: 0n, creditCents: 10000n },
        ],
      })
    ).not.toThrow();
  });
});

describe("Chart of Accounts templates", () => {
  it("UNIVERSAL_ACCOUNTS has unique codes", () => {
    const codes = UNIVERSAL_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("UNIVERSAL_ACCOUNTS includes Retained Earnings as system account", () => {
    const re = UNIVERSAL_ACCOUNTS.find((a) => a.code === "3900");
    expect(re?.isSystem).toBe(true);
    expect(re?.type).toBe("EQUITY");
  });

  it("buildChartTemplate(no industry) returns universal accounts", () => {
    const chart = buildChartTemplate();
    expect(chart.length).toBe(UNIVERSAL_ACCOUNTS.length);
  });

  it("buildChartTemplate(REAL_ESTATE) includes rental income", () => {
    const chart = buildChartTemplate("REAL_ESTATE");
    const rental = chart.find((a) => a.name === "Rental Income");
    expect(rental).toBeDefined();
  });

  it("buildChartTemplate(SAAS) includes deferred revenue", () => {
    const chart = buildChartTemplate("SAAS");
    expect(chart.find((a) => a.name === "Deferred Revenue")).toBeDefined();
    expect(chart.find((a) => a.name === "Hosting & Infrastructure")).toBeDefined();
  });

  it("industry-specific overrides take precedence over universal on same code", () => {
    const chart = buildChartTemplate("REAL_ESTATE");
    const code4100 = chart.find((a) => a.code === "4100");
    expect(code4100?.name).toBe("Rental Income"); // not the universal default
  });

  it("returns sorted chart", () => {
    const chart = buildChartTemplate("RETAIL");
    const codes = chart.map((a) => a.code);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });
});
