import {createHash} from "node:crypto";
import {z} from "zod";

const transaction=z.object({
 externalId:z.string().min(1).max(160),
 postedDate:z.string().datetime(),
 amountCents:z.string().regex(/^-?(0|[1-9][0-9]{0,12})$/),
 description:z.string().trim().min(1).max(280),
 currency:z.literal("USD"),
 pending:z.literal(false),
}).strict();
const payload=z.object({
 transactions:z.array(transaction).max(500),
 truncated:z.literal(false),
}).strict();
export type BankFeedTransaction=z.infer<typeof transaction>;
export function bankFeedImportConfigured():boolean{
 if(process.env.CHESS_BANK_FEED_ENABLED!=="true" ||
    process.env.CHESS_BANK_FEED_IMPORT_ENABLED!=="true" ||
    process.env.CHESS_BANK_FEED_SOURCE!=="PLAID")return false;
 const raw=process.env.CHESS_BANK_FEED_API_URL;
 const host=process.env.CHESS_BANK_FEED_ALLOWED_HOST;
 const key=process.env.CHESS_BANK_FEED_API_KEY;
 if(!raw||!host||!key)return false;
 try{
  const url=new URL(raw);
  return url.protocol==="https:" && url.hostname===host &&
   !url.username&&!url.password&&!url.hash;
 }catch{return false;}
}
export function feedDedupHash(tenantId:string,bankAccountId:string,externalId:string):string{
 return createHash("sha256").update(JSON.stringify({
  tenantId,bankAccountId,externalId,
 })).digest("hex");
}
export function validateBankFeed(
 input:unknown,requestedSince:Date,now=new Date(),
):BankFeedTransaction[]{
 const parsed=payload.parse(input);
 const seen=new Set<string>();
 for(const item of parsed.transactions){
  if(seen.has(item.externalId))throw new Error("Duplicate provider transaction ID.");
  seen.add(item.externalId);
  const date=new Date(item.postedDate);
  if(!Number.isFinite(date.getTime()) || date<requestedSince ||
     date.getTime()>now.getTime()+60*60_000 ||
     BigInt(item.amountCents)===0n)
   throw new Error("Invalid or out-of-period bank transaction.");
 }
 return parsed.transactions;
}
/** Approved provider gateway must independently enforce the client's
 * delegated bank access and map opaque providerAccountRef to a valid account.
 * The token is server-side only. No financial transaction is posted here. */
export async function fetchChessBankFeed(providerAccountRef:string,since:Date){
 if(!bankFeedImportConfigured())throw new Error("Bank feed import is disabled.");
 const response=await fetch(process.env.CHESS_BANK_FEED_API_URL!,{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{
   "Authorization":`Bearer ${process.env.CHESS_BANK_FEED_API_KEY!}`,
   "Content-Type":"application/json",
  },
  body:JSON.stringify({providerAccountRef,since:since.toISOString(),
   includePending:false,maxTransactions:500}),
  signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw new Error(`Bank feed returned HTTP ${response.status}`);
 return validateBankFeed(await response.json(),since);
}
