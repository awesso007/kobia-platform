import {describe,it,expect} from "vitest";
import {scanChessWorkerPages} from "./worker-pages";
const rows=Array.from({length:305},(_,i)=>({id:String(i).padStart(3,"0")}));
describe("tenant-local scheduler cursor paging",()=>{
 it("scans beyond the first 100 without duplicating a row",async()=>{
  const seen:string[]=[];
  const r=await scanChessWorkerPages(
   async(after,take)=>rows.slice(after===null?0:rows.findIndex(r=>r.id===after)+1,
    (after===null?0:rows.findIndex(r=>r.id===after)+1)+take),
   async batch=>{seen.push(...batch.map(x=>x.id));return batch.length;},
  );
  expect(r).toEqual({examined:305,inserted:305,backlog:false});
  expect(new Set(seen).size).toBe(305);
 });
 it("reports a capped backlog rather than silently finishing",async()=>{
  const r=await scanChessWorkerPages(
   async(after,take)=>rows.slice(after===null?0:rows.findIndex(x=>x.id===after)+1,
    (after===null?0:rows.findIndex(x=>x.id===after)+1)+take),
   async batch=>batch.length,{pageSize:100,maxPages:2},
  );
  expect(r).toEqual({examined:200,inserted:200,backlog:true});
 });
 it("fails closed on a nonadvancing cursor or excessive pages",async()=>{
  await expect(scanChessWorkerPages(async()=>[{id:"a"},{id:"a"}],
   async rows=>rows.length)).rejects.toThrow("cursor");
  await expect(scanChessWorkerPages(async()=>[{id:"a"}],
   async()=>1,{pageSize:0})).rejects.toThrow("paging");
 });
});
