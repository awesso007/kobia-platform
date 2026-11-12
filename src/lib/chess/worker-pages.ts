/**
 * Tenant-local, deterministic cursor paging for private scheduler scans.
 * Capped runs signal backlog explicitly rather than silently ignoring
 * records beyond the first page. Existing dedupe keys allow safe retry.
 */
export type WorkerPage<T extends {id:string}>=(afterId:string|null,take:number)=>Promise<T[]>;
export type WorkerBatch<T>=(rows:T[])=>Promise<number>;
export type ScanSummary={examined:number;inserted:number;backlog:boolean};

export async function scanChessWorkerPages<T extends {id:string}>(
 load:WorkerPage<T>,process:WorkerBatch<T>,
 options:{pageSize?:number;maxPages?:number}={},
):Promise<ScanSummary>{
 const pageSize=options.pageSize??100;
 const maxPages=options.maxPages??50;
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>250||
  !Number.isSafeInteger(maxPages)||maxPages<1||maxPages>200)
  throw new RangeError("Invalid bounded worker paging configuration.");
 let after:string|null=null;
 let examined=0,inserted=0;
 for(let i=0;i<maxPages;i++){
  const rows=await load(after,pageSize);
  if(rows.length>pageSize)throw new Error("Worker page exceeds configured maximum.");
  if(rows.length===0)return {examined,inserted,backlog:false};
  const ids=rows.map(row=>row.id);
  if(new Set(ids).size!==ids.length||ids.includes(after??""))
   throw new Error("Worker cursor did not advance.");
  inserted+=await process(rows);
  examined+=rows.length;
  after=ids[ids.length-1]!;
  if(rows.length<pageSize)return {examined,inserted,backlog:false};
 }
 // Conservative: an exact full last page reports backlog. Monitor the
 // DEGRADED run and raise the cap only after load and privacy review.
 return {examined,inserted,backlog:true};
}
