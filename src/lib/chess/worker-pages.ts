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
 const seen=new Set<string>();
 for(let i=0;i<maxPages;i++){
  const rows=await load(after,pageSize);
  if(rows.length>pageSize)throw new Error("Worker page exceeds configured maximum.");
  if(rows.length===0)return {examined,inserted,backlog:false};
  const ids=rows.map(row=>row.id);
  if(ids.some(id=>!id||seen.has(id))||
   new Set(ids).size!==ids.length||ids.includes(after??""))
   throw new Error("Worker cursor did not advance.");
  // Detect any repeated record across different pages, not just the last
  // cursor. Cursor order is provider-defined, so IDs are not compared
  // lexicographically.
  for(const id of ids)seen.add(id);
  inserted+=await process(rows);
  examined+=rows.length;
  after=ids[ids.length-1]!;
  if(rows.length<pageSize)return {examined,inserted,backlog:false};
 }
 // One read-only lookahead distinguishes exact-cap completion from real
 // overflow. It cannot send a worker notification or mutate a source row.
 const remainder=await load(after,1);
 if(remainder.length>1)throw new Error("Worker overflow probe exceeds maximum.");
 if(remainder.some(row=>!row.id||seen.has(row.id)))
  throw new Error("Worker overflow cursor did not advance.");
 return {examined,inserted,backlog:remainder.length>0};
}
