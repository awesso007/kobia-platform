// Read-only, explicitly opted-in sandbox validation. Does NOT import,
// categorize or post any bank transaction into the KOBIA ledger.
function required(key){
 const value=process.env[key];
 if(!value)throw new Error(key+" is missing");
 return value;
}
if(process.env.CHESS_BANK_FEED_SANDBOX_VALIDATE!=="true" ||
 process.env.CHESS_BANK_FEED_SANDBOX_ISOLATED!=="true")
 throw new Error("Isolated bank feed sandbox validation is disabled.");
if(process.env.CHESS_BANK_FEED_SOURCE!=="PLAID")
 throw new Error("Only an approved Plaid-backed adapter is supported.");
const host=required("CHESS_BANK_FEED_ALLOWED_HOST");
const base=new URL(required("CHESS_BANK_FEED_API_URL"));
if(base.protocol!=="https:"||base.hostname!==host||base.username||
 base.password||base.hash)throw new Error("Bank feed host is not approved.");
const ref=required("CHESS_BANK_FEED_SANDBOX_ACCOUNT_REF");
if(!/^[A-Za-z0-9_-]{6,160}$/.test(ref))
 throw new Error("Use an opaque, sandbox-only provider account reference.");
const since=new Date(Date.now()-7*86400000).toISOString();
const res=await fetch(base,{method:"POST",redirect:"error",cache:"no-store",
 headers:{"Authorization":"Bearer "+required("CHESS_BANK_FEED_API_KEY"),
  "Content-Type":"application/json"},
 body:JSON.stringify({providerAccountRef:ref,since,includePending:false,
  maxTransactions:500}),signal:AbortSignal.timeout(15000)});
if(!res.ok)throw new Error("Bank feed sandbox returned HTTP "+res.status);
const body=await res.json();
if(!body||typeof body!=="object"||body.truncated!==false||
 !Array.isArray(body.transactions)||body.transactions.length>500)
 throw new Error("Bank feed sandbox response is incomplete or invalid.");
const identifiers=new Set();
for(const transaction of body.transactions){
 if(!transaction||typeof transaction!=="object"||
  typeof transaction.externalId!=="string"||!transaction.externalId||
  identifiers.has(transaction.externalId)||
  typeof transaction.postedDate!=="string"||
  !Number.isFinite(Date.parse(transaction.postedDate))||
  typeof transaction.description!=="string"||
  transaction.description.length<1||transaction.description.length>280||
  !/^-?(0|[1-9][0-9]{0,12})$/.test(transaction.amountCents)||
  transaction.pending!==false||transaction.currency!=="USD")
  throw new Error("Bank feed sandbox returned invalid posted transaction data.");
 identifiers.add(transaction.externalId);
}
console.log("PASS sandbox banking provider contract: "+body.transactions.length+
 " posted transactions; no transactions imported or logged.");
