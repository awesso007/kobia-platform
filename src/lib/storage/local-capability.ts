/** Short-lived HMAC bearer link for the legacy LOCAL fallback. No secret = no link. */
import {createHmac,timingSafeEqual} from "node:crypto";

const MAX_TTL=60;
function signingKey():string{
 const key=process.env.KOBIA_LOCAL_DOWNLOAD_SIGNING_KEY??"";
 if(Buffer.byteLength(key,"utf8")<32)throw new Error("Local download signing key unavailable");
 return key;
}
function digest(storageKey:string,expires:string,key:string):Buffer{
 return createHmac("sha256",key).update(expires+"\0"+storageKey).digest();
}
export function signedLocalDownloadUrl(
 storageKey:string,ttlSeconds=MAX_TTL,now=Date.now(),
):string{
 if(!Number.isFinite(ttlSeconds)||ttlSeconds<=0)throw new Error("Invalid TTL");
 const key=signingKey();
 const expires=String(Math.floor(now/1000)+Math.min(Math.floor(ttlSeconds),MAX_TTL));
 const signature=digest(storageKey,expires,key).toString("hex");
 return "/api/files/local/"+encodeURIComponent(storageKey)+
  "?exp="+encodeURIComponent(expires)+"&sig="+signature;
}
export function verifyLocalDownloadCapability(
 storageKey:string,expires:string|null,signature:string|null,now=Date.now(),
):boolean{
 if(!expires||!signature||!/^\d{10,12}$/.test(expires)||!/^[0-9a-f]{64}$/.test(signature))return false;
 const expiry=Number(expires);
 const current=Math.floor(now/1000);
 if(!Number.isSafeInteger(expiry)||expiry<current||expiry>current+MAX_TTL)return false;
 let key:string;
 try{key=signingKey();}catch{return false;}
 const expected=digest(storageKey,expires,key);
 const supplied=Buffer.from(signature,"hex");
 return supplied.length===expected.length&&timingSafeEqual(expected,supplied);
}
