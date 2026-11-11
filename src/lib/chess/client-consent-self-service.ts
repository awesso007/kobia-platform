import {auth,currentUser} from "@clerk/nextjs/server";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {PermissionError} from "@/lib/rbac/require-permission";
import {normalizeEmail} from "./client-consent";

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
const select={
 id:true,businessId:true,clientProfileId:true,purpose:true,
 policyVersion:true,policyText:true,status:true,
 acceptedByClerkUserId:true,expiresAt:true,consentedAt:true,
 withdrawnAt:true,createdAt:true,
} as const;

/** Read-only portal. No listing of other users or client-profile names.
 * The tenant is resolved by trusted middleware, never from arbitrary headers. */
export async function listOwnClientConsents(){
 const viewer=await verifiedViewer();
 const {db}=getTenantDb();
 const contacts=await db.contact.findMany({where:{
  email:{equals:viewer.email,mode:"insensitive"},
 },select:{id:true,email:true},take:101});
 if(contacts.length>100)throw new PermissionError("record:read");
 const ids=contacts.filter(c=>verifiedConsentContactMatch(
  viewer.email,c.email)).map(c=>c.id);
 if(!ids.length)return [];
 const profiles=await db.clientProfile.findMany({where:{contactId:{in:ids}},
  select:{id:true},take:101});
 if(profiles.length>100)throw new PermissionError("record:read");
 const profileIds=profiles.map(p=>p.id);
 if(!profileIds.length)return [];
 const consents=await db.chessClientConsent.findMany({where:{
  clientProfileId:{in:profileIds},
 },select,orderBy:{createdAt:"desc"},take:101});
 if(consents.length>100)throw new PermissionError("record:read");
 const now=new Date();
 return consents.flatMap(row=>{
  const state=selfConsentState(row,viewer.clerkUserId,now);
  return state?[{id:row.id,purpose:row.purpose,
   policyVersion:row.policyVersion,status:state,
   createdAt:row.createdAt}]:[];
 });
}

/** One visible document snapshot per request, matching the Clerk-verified
 * primary email to the profile's current CRM contact in this tenant. */
export async function getOwnClientConsent(consentId:string){
 if(!/^[A-Za-z0-9_-]{5,128}$/.test(consentId))
  throw new PermissionError("record:read");
 const viewer=await verifiedViewer();
 const {db}=getTenantDb();
 const row=await db.chessClientConsent.findUnique({where:{id:consentId},select});
 if(!row||row.policyText.length<50)throw new PermissionError("record:read");
 const profile=await db.clientProfile.findUnique({where:{id:row.clientProfileId},
  select:{contactId:true}});
 if(!profile?.contactId)throw new PermissionError("record:read");
 const contact=await db.contact.findUnique({where:{id:profile.contactId},
  select:{email:true}});
 if(!verifiedConsentContactMatch(viewer.email,contact?.email))
  throw new PermissionError("record:read");
 const status=selfConsentState(row,viewer.clerkUserId);
 if(!status)throw new PermissionError("record:read");
 return {id:row.id,purpose:row.purpose,policyVersion:row.policyVersion,
  policyText:row.policyText,status,createdAt:row.createdAt,
  expiresAt:row.expiresAt,consentedAt:row.consentedAt,
  withdrawnAt:row.withdrawnAt};
}
