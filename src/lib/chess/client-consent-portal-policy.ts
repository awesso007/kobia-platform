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
