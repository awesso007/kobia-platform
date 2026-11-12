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


/** Forbid inactive/misclassified bank GLs and unsupported account types.
 * A credit card account is a liability, cash accounts are assets.
 * Loan/other products need their own independently reviewed mapping. */
export function bankGlAccountMatchesType(bankType:string,glType:string):boolean{
 if(["CHECKING","SAVINGS","MONEY_MARKET"].includes(bankType))
  return glType==="ASSET";
 if(bankType==="CREDIT_CARD")return glType==="LIABILITY";
 return false;
}
