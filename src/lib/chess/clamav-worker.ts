import {createHash,timingSafeEqual} from "node:crypto";
import {createConnection} from "node:net";
import {z} from "zod";
import {getTenantDb} from "@/lib/db/get-tenant-db";
import {getObjectBody,headObject} from "@/lib/storage/s3";

const MAX_BYTES=20*1024*1024;
const MAX_SCAN_BATCH=10;
export const scanWorkerInput=z.object({limit:z.number().int().min(1).max(MAX_SCAN_BATCH).default(5)}).strict();

export function isAuthorizedScanWorker(provided:string):boolean {
 const secret=process.env.CHESS_SCAN_WORKER_TOKEN;
 if(!secret || secret.length<32 || !provided)return false;
 const expected=createHash("sha256").update(secret).digest();
 const supplied=createHash("sha256").update(provided).digest();
 return timingSafeEqual(expected,supplied);
}

export async function scanWithClamAv(content:Buffer):Promise<"CLEAN"|"INFECTED"> {
 const hostname=process.env.CHESS_CLAMAV_HOST;
 const port=Number(process.env.CHESS_CLAMAV_PORT??"3310");
 if(!hostname || !Number.isInteger(port) || port<1 || port>65535){
  throw new Error("ClamAV is not configured.");
 }
 if(content.length===0 || content.length>MAX_BYTES)throw new Error("Object outside allowed scan size.");
 return new Promise((resolve,reject)=>{
  const socket=createConnection({host:hostname,port});
  let message="";
  let settled=false;
  const finish=(error?:Error,result?:"CLEAN"|"INFECTED")=>{
   if(settled)return;settled=true;socket.destroy();
   if(error)reject(error);else if(result)resolve(result);else reject(new Error("Scanner returned no result."));
  };
  socket.setTimeout(30000,()=>finish(new Error("ClamAV timeout.")));
  socket.on("error",error=>finish(error));
  socket.on("connect",()=>{
   socket.write(Buffer.from("zINSTREAM\0"));
   for(let offset=0;offset<content.length;offset+=65536){
    const part=content.subarray(offset,Math.min(offset+65536,content.length));
    const size=Buffer.alloc(4);size.writeUInt32BE(part.length,0);
    socket.write(size);socket.write(part);
   }
   socket.write(Buffer.alloc(4));
  });
  socket.on("data",(chunk:Buffer)=>{
   message+=chunk.toString("utf8");
   if(message.length>2048){finish(new Error("Unexpected scanner response."));return;}
   if(message.includes("\0") || message.includes("\n")){
    if(/^stream: OK[\0\n]/.test(message))finish(undefined,"CLEAN");
    else if(/^stream: .+ FOUND[\0\n]/.test(message))finish(undefined,"INFECTED");
    else finish(new Error("Scanner did not verify object."));
   }
  });
  socket.on("end",()=>finish(new Error("ClamAV disconnected early.")));
 });
}

/** Server-to-server worker only. Never release an object unless the scanner
 * actually read and checked its bytes, and S3 metadata still matches. */
export async function scanPendingChessDocuments(limit=5){
 const parsed=scanWorkerInput.parse({limit});
 const {db}=getTenantDb();
 const docs=await db.chessClientDocument.findMany({
  where:{status:"QUARANTINED"},take:parsed.limit,orderBy:{createdAt:"asc"},
 });
 let clean=0,infected=0,errors=0;
 for(const document of docs){
  try{
   if(!document.storageVersionId || !document.storageETag) throw new Error("Document has no pinned object version.");
   const head=await headObject(document.storageKey,document.storageVersionId);
   if(!head || head.versionId!==document.storageVersionId || head.etag!==document.storageETag ||
    head.size!==document.actualBytes || head.size<1 ||
    head.size>document.maxBytes || head.size>MAX_BYTES || head.mimeType!==document.mimeType){
    await db.chessClientDocument.updateMany({
     where:{id:document.id,status:"QUARANTINED"},data:{status:"REJECTED"},
    });
    infected++;continue;
   }
   const body=await getObjectBody(document.storageKey,document.storageVersionId);
   const bytes=Buffer.from(await body.transformToByteArray());
   if(bytes.length!==head.size)throw new Error("Object length changed during scan.");
   const result=await scanWithClamAv(bytes);
   const checksumSha256=createHash("sha256").update(bytes).digest("hex");
   // Recheck storage metadata immediately before release.
   const headAgain=await headObject(document.storageKey,document.storageVersionId);
   if(!headAgain || headAgain.versionId!==document.storageVersionId ||
    headAgain.etag!==document.storageETag || headAgain.size!==head.size || headAgain.mimeType!==head.mimeType)
    throw new Error("Object changed after scanning.");
   await db.chessClientDocument.updateMany({
    where:{id:document.id,status:"QUARANTINED"},data:{
     status:result==="CLEAN"?"READY":"REJECTED",checksumSha256,verifiedAt:new Date(),
    },
   });
   if(result==="CLEAN")clean++;else infected++;
  }catch{
   // Fail closed: scan failure leaves the item quarantined for retry/investigation.
   errors++;
  }
 }
 return {checked:docs.length,clean,infected,errors};
}
