/**
 * Provision a new accounting entity inside a tenant.
 *  - Creates the Entity record
 *  - Seeds the chart of accounts from the industry template
 *  - Optionally posts an opening-balance journal entry
 */
import { db } from "@/lib/db";
import { buildChartTemplate } from "./chart-of-accounts-templates";
import { postJournalEntry } from "./ledger";

export type OpeningBalance = {
  accountCode: string;
  debitCents?: bigint;
  creditCents?: bigint;
};

export async function provisionEntity(input: {
  tenantId: string;
  name: string;
  legalName?: string;
  ein?: string;
  industry?: string;
  fiscalYearEnd?: string;
  baseCurrency?: string;
  openingBalances?: OpeningBalance[];
  postedByUserId?: string;
}) {
  return db.$transaction(async (tx) => {
    const entity = await tx.entity.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        legalName: input.legalName,
        ein: input.ein,
        industry: input.industry,
        fiscalYearEnd: input.fiscalYearEnd ?? "12-31",
        baseCurrency: input.baseCurrency ?? "USD",
      },
    });

    const template = buildChartTemplate(input.industry);

    // First pass: create accounts without parent links
    const codeToId = new Map<string, string>();
    for (const t of template) {
      const acc = await tx.account.create({
        data: {
          tenantId: input.tenantId,
          entityId: entity.id,
          code: t.code,
          name: t.name,
          type: t.type,
          subtype: t.subtype,
          description: t.description,
          isSystem: t.isSystem ?? false,
        },
      });
      codeToId.set(t.code, acc.id);
    }

    // Second pass: parent links (templates don't currently use parentCode, but support is here)
    for (const t of template) {
      if (t.parentCode && codeToId.has(t.parentCode)) {
        await tx.account.update({
          where: { id: codeToId.get(t.code)! },
          data: { parentId: codeToId.get(t.parentCode)! },
        });
      }
    }

    // Opening balances → one journal entry, source = OPENING_BALANCE
    if (input.openingBalances && input.openingBalances.length > 0) {
      const lines = input.openingBalances.map((b) => {
        const accountId = codeToId.get(b.accountCode);
        if (!accountId) throw new Error(`Account code ${b.accountCode} not found in template`);
        return {
          accountId,
          debitCents: b.debitCents ?? 0n,
          creditCents: b.creditCents ?? 0n,
        };
      });

      await postJournalEntry(
        {
          tenantId: input.tenantId,
          entityId: entity.id,
          entryDate: new Date(),
          description: "Opening balances",
          source: "OPENING_BALANCE",
          lines,
        },
        { postedByUserId: input.postedByUserId, client: tx }
      );
    }

    return entity;
  });
}
