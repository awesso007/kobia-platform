/** A live client portal is independently approved, not inferred from
 * a successful CI build or from ordinary employee CRM access. */
export function clientConsentPortalActive(config:{
 enabled?:string;policyApproved?:string;identityApproved?:string;
}):boolean{
 return config.enabled==="true"&&config.policyApproved==="true"&&
  config.identityApproved==="true";
}
export function currentClientConsentPortalActive():boolean{
 return clientConsentPortalActive({
  enabled:process.env.CHESS_CLIENT_CONSENT_PORTAL_ENABLED,
  policyApproved:process.env.CHESS_CLIENT_PORTAL_POLICY_APPROVED,
  identityApproved:process.env.CHESS_CLIENT_PORTAL_IDENTITY_APPROVED,
 });
}

/** Server-side mutation gate: hiding the portal UI is not authorization.
 * Consent acceptance requires the same three external approvals as the
 * portal. Existing clients may still withdraw previously accepted consent
 * if the portal is switched off; verified ownership and the financial
 * attempt guard remain mandatory. The fictional demo can do NEITHER. */
export function clientConsentMutationAllowed(config:{
 enabled?:string;policyApproved?:string;identityApproved?:string;
 demoMode?:string;
},action:"ACCEPT"|"WITHDRAW"):boolean{
 if(config.demoMode==="true")return false;
 return action==="WITHDRAW" || clientConsentPortalActive(config);
}
export function currentClientConsentMutationAllowed(
 action:"ACCEPT"|"WITHDRAW",
):boolean{
 return clientConsentMutationAllowed({
  enabled:process.env.CHESS_CLIENT_CONSENT_PORTAL_ENABLED,
  policyApproved:process.env.CHESS_CLIENT_PORTAL_POLICY_APPROVED,
  identityApproved:process.env.CHESS_CLIENT_PORTAL_IDENTITY_APPROVED,
  demoMode:process.env.CHESS_DEMO_MODE,
 },action);
}
