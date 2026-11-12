/**
 * Four independently controlled release flags; all false/unset by default.
 * Do not derive authorization from the CHESS demo switch or a UI approval.
 * Bank-origin and financial/role/signoff acceptance MUST happen separately.
 */
export type BankPostingGate={
 CHESS_BANK_POSTING_ENABLED?:string;
 CHESS_BANK_POSTING_POLICY_APPROVED?:string;
 CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED?:string;
 CHESS_BANK_POSTING_OPERATOR_APPROVED?:string;
};
export function chessBankPostingEnabled(env:BankPostingGate):boolean{
 return env.CHESS_BANK_POSTING_ENABLED==="true"&&
  env.CHESS_BANK_POSTING_POLICY_APPROVED==="true"&&
  env.CHESS_BANK_POSTING_BANK_SANDBOX_APPROVED==="true"&&
  env.CHESS_BANK_POSTING_OPERATOR_APPROVED==="true";
}
export function postingSourceRef(reviewId:string):string{
 if(!/^[A-Za-z0-9_-]{8,128}$/.test(reviewId))
  throw new Error("Refusing malformed immutable bank-review identifier.");
 return "chess-bank-review:"+reviewId;
}
