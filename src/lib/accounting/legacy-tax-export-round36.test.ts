import {describe,expect,it,vi} from "vitest";
import type {AuthContext} from "@/lib/auth";
import {auditedLegacyTaxExport,parseLegacyTaxYear} from "./legacy-tax-export";

const context={
 tenant:{id:"tenant-a",isActive:true},
 user:{id:"user-a"},
 // An earlier role snapshot must not authorize this sensitive read.
 membership:{role:"OWNER",isActive:true},
} as unknown as AuthContext;

function setup(opts:{
 role?:"OWNER"|"ADMIN"|"ACCOUNTANT"|"STAFF"|"CLIENT"|"VIEWER";
 memberActive?:boolean;tenantActive?:boolean;entityExists?:boolean;
}={}){
 const tx={
  tenant:{findUnique:vi.fn(async()=>({isActive:opts.tenantActive??true}))},
  membership:{findUnique:vi.fn(async()=>({
   role:opts.role??"ACCOUNTANT",isActive:opts.memberActive??true,
  }))},
  entity:{findFirst:vi.fn(async()=>opts.entityExists===false?
   null:{id:"entity-a",name:"Fictional entity",baseCurrency:"USD"})},
  auditLog:{create:vi.fn(async (_event:unknown)=>({id:"audit-a"}))},
 };
 const db={$transaction:vi.fn(async(
  callback:(t:typeof tx)=>Promise<unknown>,
 )=>callback(tx))};
 const read=vi.fn(async()=>({taxId:"PRIVATE-123",email:"private@example.test"}));
 return {tx,db,read};
}

describe("Round 36: legacy 1099 tax export access",()=>{
 it.each(["OWNER","ADMIN","ACCOUNTANT"] as const)(
  "allows current %s role and commits a privacy-minimal audit",async role=>{
   const {tx,db,read}=setup({role});
   const result=await auditedLegacyTaxExport(
    context,"entity-a","1099_NEC",read,db as never,
   );
   expect(result?.data.taxId).toBe("PRIVATE-123");
   expect(read).toHaveBeenCalledTimes(1);
   expect(tx.membership.findUnique).toHaveBeenCalledWith({
    where:{userId_tenantId:{userId:"user-a",tenantId:"tenant-a"}},
    select:{isActive:true,role:true},
   });
   expect(tx.entity.findFirst).toHaveBeenCalledWith({
    where:{id:"entity-a",tenantId:"tenant-a",isActive:true},
    select:{id:true,name:true,baseCurrency:true},
   });
   expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function),{
    isolationLevel:"Serializable",
   });
   expect(tx.auditLog.create).toHaveBeenCalledWith({data:{
    tenantId:"tenant-a",userId:"user-a",
    action:"sensitive.export.1099_nec",
    entityType:"Entity",entityId:"entity-a",
    metadata:{decision:"ALLOW",form:"1099_NEC"},
   }});
   expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("PRIVATE-123");
   expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain("private@example.test");
  }
 );
 it.each(["STAFF","CLIENT","VIEWER"] as const)(
  "denies %s even when the stale request context says OWNER",async role=>{
   const {tx,db,read}=setup({role});
   const result=await auditedLegacyTaxExport(
    context,"entity-a","1099_MISC",read,db as never,
   );
   expect(result).toBeNull();
   expect(read).not.toHaveBeenCalled();
   expect(tx.auditLog.create).toHaveBeenCalledWith({data:
    expect.objectContaining({action:"sensitive.export.1099_misc",
     metadata:{decision:"DENY",form:"1099_MISC"}}),
   });
  }
 );
 it("denies suspended membership before reading vendor records",async()=>{
  const {db,read}=setup({memberActive:false});
  expect(await auditedLegacyTaxExport(context,"entity-a","1099_NEC",
   read,db as never)).toBeNull();
  expect(read).not.toHaveBeenCalled();
 });
 it("denies a disabled tenant or unrelated/deleted entity",async()=>{
  for(const opts of [{tenantActive:false},{entityExists:false}]){
   const {tx,db,read}=setup(opts);
   expect(await auditedLegacyTaxExport(context,"entity-a","1099_MISC",
    read,db as never)).toBeNull();
   expect(read).not.toHaveBeenCalled();
   expect(tx.auditLog.create).toHaveBeenCalledWith({data:
    expect.objectContaining({metadata:{decision:"DENY",form:"1099_MISC"}}),
   });
  }
 });
 it("never returns selected taxpayer data if the audit insert fails",async()=>{
  const {tx,db,read}=setup();
  tx.auditLog.create.mockRejectedValueOnce(new Error("audit storage unavailable"));
  await expect(auditedLegacyTaxExport(context,"entity-a","1099_NEC",
   read,db as never)).rejects.toThrow("audit storage unavailable");
  expect(read).toHaveBeenCalledTimes(1);
 });
 it("parses only valid four-digit tax years",()=>{
  const today=new Date("2026-11-12T12:00:00Z");
  expect(parseLegacyTaxYear(null,today)).toBe(2026);
  expect(parseLegacyTaxYear("2025",today)).toBe(2025);
  for(const value of ["","NaN","2026.5","-2020","0000","9999","20000","202x"]){
   expect(parseLegacyTaxYear(value,today)).toBeNull();
  }
 });
});
