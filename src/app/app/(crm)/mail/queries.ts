/*
 * Server-only page data loaders for the Webmail module (Sprint 23). These wrap
 * the request-scoped tenant db + current membership and reuse the shared
 * src/lib/mail query helpers. Server pages call these; the client MailUI then
 * talks to /api/mail/** for every interaction and refreshes the route.
 *
 * No em-dashes in copy by project convention (use hyphens).
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership } from "@/lib/rbac/require-permission";
import {
  getOwnedAccount,
  listAccounts,
  listMessages,
  getThread,
  listLabels,
  listFilters,
  listDrafts,
  listSignatures,
  folderCounts,
  type ListMessagesArgs,
} from "@/lib/mail/queries";
import type { EmailFolder } from "@/lib/db/generated/tenant";

export const FOLDERS: EmailFolder[] = ["INBOX", "SENT", "DRAFTS", "ARCHIVE", "SPAM", "TRASH"];

async function ctx() {
  const { db } = getTenantDb();
  const member = await getCurrentMembership();
  return { db, userId: member?.clerkUserId ?? null };
}

/** Accounts + current user for the redirect/picker root. */
export async function loadAccounts() {
  const { db, userId } = await ctx();
  const accounts = await listAccounts(db, userId);
  return { accounts, userId };
}

type ViewArgs = {
  accountId: string;
  folder?: EmailFolder;
  labelId?: string;
  q?: string;
  cursor?: string;
};

/** The three-pane shell data: account, sidebar rails, and the middle list. */
export async function loadMailView(args: ViewArgs) {
  const { db, userId } = await ctx();
  const account = await getOwnedAccount(db, args.accountId, userId);
  if (!account) return null;
  const listArgs: ListMessagesArgs = {
    accountId: account.id,
    folder: args.folder ?? null,
    labelId: args.labelId ?? null,
    q: args.q ?? null,
    cursor: args.cursor ?? null,
  };
  const [accounts, labels, counts, list] = await Promise.all([
    listAccounts(db, userId),
    listLabels(db, account.id),
    folderCounts(db, account.id),
    listMessages(db, listArgs),
  ]);
  return { account, accounts, labels, counts, messages: list.messages, nextCursor: list.nextCursor };
}

/** Shell data plus a fully expanded thread for the reader pane. */
export async function loadThreadView(accountId: string, threadId: string) {
  const { db, userId } = await ctx();
  const account = await getOwnedAccount(db, accountId, userId);
  if (!account) return null;
  const [accounts, labels, counts, thread, signatures, list] = await Promise.all([
    listAccounts(db, userId),
    listLabels(db, account.id),
    folderCounts(db, account.id),
    getThread(db, account.id, threadId),
    listSignatures(db, account.id, userId),
    listMessages(db, { accountId: account.id, folder: "INBOX" }),
  ]);
  if (!thread) return null;
  return {
    account,
    accounts,
    labels,
    counts,
    thread,
    signatures,
    messages: list.messages,
    nextCursor: list.nextCursor,
  };
}

/** Compose page: shell rails + drafts + signatures for the composer. */
export async function loadComposeView(accountId: string) {
  const { db, userId } = await ctx();
  const account = await getOwnedAccount(db, accountId, userId);
  if (!account) return null;
  const [accounts, labels, counts, signatures] = await Promise.all([
    listAccounts(db, userId),
    listLabels(db, account.id),
    folderCounts(db, account.id),
    listSignatures(db, account.id, userId),
  ]);
  return { account, accounts, labels, counts, signatures };
}

/** Settings page: labels, filters, signatures. */
export async function loadSettingsView(accountId: string) {
  const { db, userId } = await ctx();
  const account = await getOwnedAccount(db, accountId, userId);
  if (!account) return null;
  const [accounts, labels, filters, signatures, drafts] = await Promise.all([
    listAccounts(db, userId),
    listLabels(db, account.id),
    listFilters(db, account.id),
    listSignatures(db, account.id, userId),
    listDrafts(db, account.id),
  ]);
  return { account, accounts, labels, filters, signatures, drafts };
}
