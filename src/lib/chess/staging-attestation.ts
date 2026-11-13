import {timingSafeEqual} from "node:crypto";
export type StagingAttestationConfig={
 enabled?:string;token?:string;releaseSha?:string;
};
export function validReleaseSha(raw:string|undefined):raw is string{
 return typeof raw==="string"&&/^[a-f0-9]{40}$/.test(raw);
}
/** Production staging attestations are strictly opt-in; use a separate
 * machine-only token, not a Clerk cookie or a worker scheduling token. */
export function mayReadStagingAttestation(authorization:string|null,
 config:StagingAttestationConfig):boolean{
 if(config.enabled!=="true"||!authorization||
  !config.token||config.token.length<32||!validReleaseSha(config.releaseSha))
  return false;
 const expected=Buffer.from("Bearer "+config.token,"utf8");
 const received=Buffer.from(authorization,"utf8");
 return received.length===expected.length&&timingSafeEqual(received,expected);
}
