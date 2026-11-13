import {auth,currentUser} from "@clerk/nextjs/server";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {normalizeEmail} from "./client-consent";
import {auditedChessSensitiveRead} from "./sensitive-read-audit";

type ConsentRow={
 id:string;businessId:string;clientProfileId:string;purpose:string;
 policyVersion:string;policyText:string;status:string;
 acceptedByClerkUserId:string|null;expiresAt:Date|null;
 consentedAt:Date|null;withdrawnAt:Date|null;createdAt:Date;
};
export type VisibleConsentState="PENDING"|"GRANTED"|"WITHDRAWN"|"EXPIRED";

/** Do not expose a grant accepted by a different Clerk identity simply
 * because two accounts have the same email address. */
export function selfConsentState(row:Pick<ConsentRow,
 "status"|"acceptedByClerkUserId"|"expiresAt">,
 viewerId:string,now=new Date()):VisibleConsentState|null{
 if(row.status==="PENDING")return row.expiresAt&&row.expiresAt<=now?"EXPIRED":"PENDING";
 if(row.acceptedByClerkUserId!==viewerId)return null;
 if(row.status==="GRANTED")return row.expiresAt&&row.expiresAt<=now?"EXPIRED":"GRANTED";
 if(row.status==="WITHDRAWN")return "WITHDRAWN";
 if(row.status==="EXPIRED")return "EXPIRED";
 return null;
}
export function verifiedConsentContactMatch(
 viewerEmail:string,contactEmail:string|null|undefined):boolean{
 return !!contactEmail&&normalizeEmail(viewerEmail)===normalizeEmail(contactEmail);
}
async function verifiedViewer(){
 const clerkUserId=auth().userId;
 const user=await currentUser();
 const primary=user?.primaryEmailAddress;
 if(!clerkUserId||user?.id!==clerkUserId||
  primary?.verification?.status!=="verified"||!primary.emailAddress)
  throw new PermissionError("record:read");
 return {clerkUserId,email:normalizeEmail(primary.emailAddress)};
}
const detailSelect={
 id:true,businessId:true,clientProfileId:true,purpose:true,
 policyVersion:true,policyText:true,status:true,
 acceptedByClerkUserId:true,expiresAt:true,consentedAt:true,
 withdrawnAt:true,createdAt:true,
} as const;

/** Only select metadata for the index: never bring full legal disclosure text
 * into memory when the client only requested the directory. */
const directorySelect={
 id:true,purpose:true,policyVersion:true,status:true,
 acceptedByClerkUserId:true,expiresAt:true,createdAt:true,
} as const;

/** Client-owned consent reads, like employee service reads, must commit a
 * privacy-minimal allow/deny audit in the SAME serializable tenant snapshot.
 * No email, contact ID, policy text, name or disclosure purpose is logged. */
export async function listOwnClientConsents(){
 const viewer=await verifiedViewer();
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:viewer.clerkUserId,
  action:"CLIENT_CONSENT_DIRECTORY_READ",
  resourceType:"ChessClientConsent",resourceId:"SELF_DIRECTORY",
 },async tx=>{
  const contacts=await tx.contact.findMany({where:{
   email:{equals:viewer.email,mode:"insensitive"},
  },select:{id:true,email:true},take:101});
  if(contacts.length>100)return null;
  const ids=contacts.filter(c=>verifiedConsentContactMatch(
   viewer.email,c.email)).map(c=>c.id);
  if(!ids.length)return [];
  const profiles=await tx.clientProfile.findMany({where:{contactId:{in:ids}},
   select:{id:true},take:101});
  if(profiles.length>100)return null;
  const profileIds=profiles.map(p=>p.id);
  if(!profileIds.length)return [];
  const consents=await tx.chessClientConsent.findMany({where:{
   clientProfileId:{in:profileIds},
  },select:directorySelect,orderBy:{createdAt:"desc"},take:101});
  if(consents.length>100)return null;
  const now=new Date();
  return consents.flatMap(row=>{
   const state=selfConsentState(row,viewer.clerkUserId,now);
   return state?[{id:row.id,purpose:row.purpose,
    policyVersion:row.policyVersion,status:state,
    createdAt:row.createdAt}]:[];
  });
 });
}

/** Full disclosure is visible only after a verified Clerk primary email,
 * current contact ownership, and state-bound Clerk grant are evaluated in
 * the same audited transaction that reads the policy snapshot. */
export async function getOwnClientConsent(consentId:string){
 const viewer=await verifiedViewer();
 const valid=/^[A-Za-z0-9_-]{5,128}$/.test(consentId);
 const {db}=getTenantDb();
 return auditedChessSensitiveRead(db,{
  actorClerkUserId:viewer.clerkUserId,
  action:"CLIENT_CONSENT_DISCLOSURE_READ",
  resourceType:"ChessClientConsent",resourceId:valid?consentId:"INVALID",
 },async tx=>{
  if(!valid)return null;
  const row=await tx.chessClientConsent.findUnique({
   where:{id:consentId},select:detailSelect,
  });
  if(!row||row.policyText.length<50)return null;
  const profile=await tx.clientProfile.findUnique({
   where:{id:row.clientProfileId},select:{contactId:true},
  });
  if(!profile?.contactId)return null;
  const contact=await tx.contact.findUnique({
   where:{id:profile.contactId},select:{email:true},
  });
  if(!verifiedConsentContactMatch(viewer.email,contact?.email))
   return null;
  const status=selfConsentState(row,viewer.clerkUserId);
  if(!status)return null;
  return {id:row.id,purpose:row.purpose,policyVersion:row.policyVersion,
   policyText:row.policyText,status,createdAt:row.createdAt,
   expiresAt:row.expiresAt,consentedAt:row.consentedAt,
   withdrawnAt:row.withdrawnAt};
 });
}
