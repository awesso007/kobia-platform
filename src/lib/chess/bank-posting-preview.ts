/**
 * M5-06: conservative pre-posting preview, not an execution adapter.
 * Immutable bank transaction fingerprint and a third independent human
 * are required. This module NEVER writes a journal or changes bank status.
 */
export type ApprovedBankReview = {
 status: string;
 createdByClerkUserId: string;
 reviewedByClerkUserId: string | null;
 approvedAccountId: string | null;
 transactionDigest: string;
};
export type SourceBankSnapshot = {
 id: string;
 bankAccountGlId: string;
 amountCents: bigint;
 status: string;
 fingerprint: string;
};
export type BankPostingPreview = {
 bankTransactionId: string;
 bankGlAccountId: string;
 offsetGlAccountId: string;
 lines: {accountId:string;debitCents:string;creditCents:string}[];
 totalDebitCents: string;
 totalCreditCents: string;
 postedToLedger: false;
};
export class BankPostingPreviewError extends Error {
 constructor(){
  super("An independently approved and unchanged bank review is required.");
  this.name="BankPostingPreviewError";
 }
}
/** Does not assert settlement, final period availability, legal entity,
 * downstream recording, or external bank statement completeness. */
export function createBankPostingPreview(
 review: ApprovedBankReview,
 source: SourceBankSnapshot,
 actor: {clerkUserId:string;role:string;status:string},
): BankPostingPreview {
 const distinct=!!review.reviewedByClerkUserId &&
  new Set([review.createdByClerkUserId,review.reviewedByClerkUserId,
   actor.clerkUserId]).size===3;
 const digest=/^[a-f0-9]{64}$/;
 if(actor.status!=="ACTIVE"||!["OWNER","ADMIN"].includes(actor.role)||
  !distinct||review.status!=="APPROVED"||
  !review.approvedAccountId || review.approvedAccountId===source.bankAccountGlId||
  !digest.test(review.transactionDigest) ||
  review.transactionDigest!==source.fingerprint ||
  source.status!=="UNMATCHED" || source.amountCents===0n) {
  throw new BankPostingPreviewError();
 }
 const positive=source.amountCents>0n;
 const amount=(positive?source.amountCents:-source.amountCents).toString();
 const zero="0";
 const bank={
  accountId:source.bankAccountGlId,
  debitCents:positive?amount:zero,
  creditCents:positive?zero:amount,
 };
 const offset={
  accountId:review.approvedAccountId,
  debitCents:positive?zero:amount,
  creditCents:positive?amount:zero,
 };
 return {
  bankTransactionId:source.id,
  bankGlAccountId:source.bankAccountGlId,
  offsetGlAccountId:review.approvedAccountId,
  lines:[bank,offset],
  totalDebitCents:amount,totalCreditCents:amount,postedToLedger:false,
 };
}
