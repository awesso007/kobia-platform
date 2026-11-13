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
const paginatedPayload=z.discriminatedUnion("truncated",[
 payload,
 z.object({
  transactions:z.array(transaction).max(500),
  truncated:z.literal(true),
  nextCursor:z.string().regex(/^[A-Za-z0-9_-]{8,256}$/),
 }).strict(),
]);
export const MAX_BANK_FEED_PAGES=8;
export function bankFeedPaginationApproved(){
 return process.env.CHESS_BANK_FEED_PAGINATION_ENABLED==="true";
}
export function bankFeedPage(input:unknown,requestedSince:Date,now=new Date()){
 const data=paginatedPayload.parse(input);
 // Reuse the established transaction validation, which rejects pending,
 // duplicate or out-of-period items, without accepting truncated finality.
 validateBankFeed({transactions:data.transactions,truncated:false},requestedSince,now);
 if(data.truncated&&!bankFeedPaginationApproved())
  throw new Error("Multi-page bank feed import is not independently approved.");
 if(data.truncated&&data.transactions.length===0)
  throw new Error("Empty continuation page is not permitted.");
 return data;
}
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
/** Only a fully read, uniquely identified, ordered provider snapshot is
 * passed to the legacy UNMATCHED transaction import. Never import partial
 * pages or blindly continue unknown/missing cursors. A provider should pin
 * its own bank-session snapshot and enforce delegated authorization. */
export async function fetchChessBankFeed(providerAccountRef:string,since:Date){
 if(!bankFeedImportConfigured())throw new Error("Bank feed import is disabled.");
 if(!/^[A-Za-z0-9_-]{6,160}$/.test(providerAccountRef))
  throw new Error("Provider account reference is malformed.");
 const pageSize=500;
 const seenIds=new Set<string>(),seenCursors=new Set<string>();
 const all:BankFeedTransaction[]=[];
 let cursor:string|undefined;
 for(let page=0;page<MAX_BANK_FEED_PAGES;page++){
  const response=await fetch(process.env.CHESS_BANK_FEED_API_URL!,{
   method:"POST",redirect:"error",cache:"no-store",
   headers:{
    "Authorization":`Bearer ${process.env.CHESS_BANK_FEED_API_KEY!}`,
    "Content-Type":"application/json",
   },
   body:JSON.stringify({providerAccountRef,since:since.toISOString(),
    includePending:false,maxTransactions:pageSize,
    ...(cursor?{cursor}:{}),
   }),
   signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw new Error(`Bank feed returned HTTP ${response.status}`);
  const data=bankFeedPage(await response.json(),since);
  for(const row of data.transactions){
   if(seenIds.has(row.externalId))
    throw new Error("Duplicate provider transaction across bank-feed pages.");
   seenIds.add(row.externalId);all.push(row);
  }
  if(data.truncated===false)return all;
  const next=data.nextCursor;
  if(seenCursors.has(next))throw new Error("Bank feed cursor replay detected.");
  seenCursors.add(next);
  cursor=next;
 }
 throw new Error("Bank feed exceeds approved page cap; nothing imported.");
}
