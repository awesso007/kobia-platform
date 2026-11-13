/**
 * Round 56: Company directories and company selector metadata may disclose
 * regulated client affiliation. Show only companies for which the current
 * member has a live, service-specific grant to EVERY linked ClientProfile.
 * No unscoped facet/search exports. Fail closed beyond 500 legacy rows.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import type { TagRow } from "@/lib/crm/record";
export const COMPANIES_PAGE_SIZE=25;
const SORTABLE=new Set(["name","domain","industry","size","ownerUserId","createdAt"]);
export type CompanyRow={
  id:string;name:string;domain:string|null;industry:string|null;size:string|null;
  website:string|null;phone:string|null;address:string|null;
  ownerUserId:string|null;createdAt:string;tags:TagRow[];
};
export type CompanyListParams={
  industry?:string;owner?:string;tag?:string;search?:string;
  sort?:string;dir?:string;page?:number;
};
export type RelatedContact={id:string;name:string;email:string|null;title:string|null};
export type RelatedDeal={id:string;name:string;amountCents:number;status:string};
async function userId(){
  const m=await getCurrentMembership();
  if(!m||m.status!=="ACTIVE")throw new PermissionError("record:read");
  return m.clerkUserId;
}
export async function listCompanies(params:CompanyListParams):Promise<{
  rows:CompanyRow[];total:number;page:number;pageCount:number;
  owners:string[];industries:string[];
}>{
  const user=await userId();const {db}=getTenantDb();
  const page=Number.isSafeInteger(params.page)?Math.min(100,Math.max(1,params.page!)):1;
  return withLegacyCrmTransaction(db,user,"record:read","COMPANY","LIST",
    "LEGACY_COMPANY_DIRECTORY_READ",async(tx,actor)=>{
    const count=await tx.company.count();
    if(count>500)throw new PermissionError("record:read");
    const sort=SORTABLE.has(params.sort??"")?params.sort!:"createdAt";
    const dir=params.dir==="asc"?"asc":"desc";
    const rows=await tx.company.findMany({orderBy:{[sort]:dir},take:501});
    const allowed:typeof rows=[];
    for(const row of rows){
      try{
        await assertLegacyCrmRecord(tx,actor,"COMPANY",row.id,"record:read");
        allowed.push(row);
      }catch(e){if(!(e instanceof PermissionError))throw e;}
    }
    const owners=[...new Set(allowed.map(r=>r.ownerUserId).filter((x):x is string=>!!x))];
    const industries=[...new Set(allowed.map(r=>r.industry).filter((x):x is string=>!!x))];
    let filtered=allowed.filter(row=>
      (!params.industry||row.industry===params.industry)&&
      (!params.owner||row.ownerUserId===params.owner)&&
      (!params.search?.trim()||[row.name,row.domain,row.website].some(v=>
        v?.toLowerCase().includes(params.search!.trim().toLowerCase().slice(0,120)))));
    if(params.tag){
      const assigns=await tx.tagAssignment.findMany({
        where:{entityType:"COMPANY",tagId:params.tag,
          entityId:{in:filtered.map(r=>r.id)}},select:{entityId:true}});
      const found=new Set(assigns.map(a=>a.entityId));
      filtered=filtered.filter(r=>found.has(r.id));
    }
    const total=filtered.length;
    const selected=filtered.slice((page-1)*COMPANIES_PAGE_SIZE,page*COMPANIES_PAGE_SIZE);
    const assigns=selected.length?await tx.tagAssignment.findMany({
      where:{entityType:"COMPANY",entityId:{in:selected.map(r=>r.id)}},
      include:{tag:true},
    }):[];
    const tags:Record<string,TagRow[]>={};
    for(const a of assigns)(tags[a.entityId]??=[]).push({
      id:a.tag.id,name:a.tag.name,color:a.tag.color});
    return{rows:selected.map(r=>({
      id:r.id,name:r.name,domain:r.domain,industry:r.industry,
      size:r.size,website:r.website,phone:r.phone,address:r.address,
      ownerUserId:r.ownerUserId,createdAt:r.createdAt.toISOString(),tags:tags[r.id]??[],
    })),total,page,pageCount:Math.max(1,Math.ceil(total/COMPANIES_PAGE_SIZE)),
    owners,industries};
  });
}
export async function getCompanyRelations(companyId:string):Promise<{
  contacts:RelatedContact[];deals:RelatedDeal[];
}>{
  const user=await userId();const {db}=getTenantDb();
  return withLegacyCrmTransaction(db,user,"record:read","COMPANY",companyId,
    "LEGACY_COMPANY_RELATIONS_READ",async(tx,actor)=>{
    await assertLegacyCrmRecord(tx,actor,"COMPANY",companyId,"record:read");
    const [contacts,deals]=await Promise.all([
      tx.contact.findMany({where:{companyId},orderBy:{createdAt:"desc"},take:50}),
      tx.deal.findMany({where:{companyId},orderBy:{updatedAt:"desc"},take:50}),
    ]);
    const visibleContacts:RelatedContact[]=[];
    const visibleDeals:RelatedDeal[]=[];
    for(const c of contacts){
      try{
        await assertLegacyCrmRecord(tx,actor,"CONTACT",c.id,"record:read");
        visibleContacts.push({id:c.id,name:[c.firstName,c.lastName].filter(Boolean).join(" "),
          email:c.email,title:c.title});
      }catch(e){if(!(e instanceof PermissionError))throw e;}
    }
    for(const d of deals){
      try{
        await assertLegacyCrmRecord(tx,actor,"DEAL",d.id,"record:read");
        visibleDeals.push({id:d.id,name:d.name,amountCents:Number(d.amountCents),status:d.status});
      }catch(e){if(!(e instanceof PermissionError))throw e;}
    }
    return{contacts:visibleContacts,deals:visibleDeals};
  });
}
export async function listCompanyOptions():Promise<{id:string;name:string;domain:string|null}[]>{
  const user=await userId();const {db}=getTenantDb();
  return withLegacyCrmTransaction(db,user,"record:read","COMPANY","OPTIONS",
    "LEGACY_COMPANY_OPTIONS_READ",async(tx,actor)=>{
    const count=await tx.company.count();
    if(count>500)throw new PermissionError("record:read");
    const candidates=await tx.company.findMany({
      orderBy:{name:"asc"},select:{id:true,name:true,domain:true},take:501,
    });
    const eligible:typeof candidates=[];
    for(const row of candidates){
      try{
        await assertLegacyCrmRecord(tx,actor,"COMPANY",row.id,"record:read");
        eligible.push(row);
      }catch(e){if(!(e instanceof PermissionError))throw e;}
    }
    return eligible;
  });
}
