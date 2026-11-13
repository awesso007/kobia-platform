/**
 * Round 56: a Deal pipeline/board must not list another client's amount,
 * stage, contact name, tag or stale ownership. Resolve all client grants,
 * business unit scope and receipt in a serializable transaction. Until
 * explicit businessId is migrated, deny historical boards with >500 deals.
 */
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import type { TagRow } from "@/lib/crm/record";

export type PipelineOption={id:string;name:string;isDefault:boolean};
export type StageCol={id:string;name:string;sortOrder:number;isWon:boolean;isLost:boolean;probability:number;rottingDays:number|null;color:string|null};
export type DealCard={
  id:string;name:string;stageId:string;amountCents:number;contactName:string|null;
  daysInStage:number;status:string;tags:TagRow[];
};
export type DealBoard={
  pipelines:PipelineOption[];activePipelineId:string|null;
  stages:StageCol[];deals:DealCard[];
};
export async function getDealBoard(pipelineId?:string):Promise<DealBoard>{
  const member=await getCurrentMembership();
  if(!member||member.status!=="ACTIVE")throw new PermissionError("record:read");
  const {db}=getTenantDb();
  return withLegacyCrmTransaction(db,member.clerkUserId,"record:read","DEAL",
    "BOARD","LEGACY_DEAL_BOARD_READ",async(tx,actor)=>{
      const pipelines=await tx.pipeline.findMany({
        where:{entityType:"DEAL",archivedAt:null},
        orderBy:[{order:"asc"},{isDefault:"desc"},{createdAt:"asc"}],take:100,
      });
      if(!pipelines.length)return {pipelines:[],activePipelineId:null,stages:[],deals:[]};
      const active=pipelines.find(p=>p.id===pipelineId) ??
        pipelines.find(p=>p.isDefault) ?? pipelines[0]!;
      const count=await tx.deal.count({where:{pipelineId:active.id}});
      if(count>500)throw new PermissionError("record:read");
      const [stages,all]=await Promise.all([
        tx.dealStage.findMany({where:{pipelineId:active.id},orderBy:{sortOrder:"asc"},take:80}),
        tx.deal.findMany({where:{pipelineId:active.id},
          orderBy:{updatedAt:"desc"},take:501,
          include:{contact:{select:{firstName:true,lastName:true}}}}),
      ]);
      const allowed:typeof all=[];
      for(const row of all){
        try{
          await assertLegacyCrmRecord(tx,actor,"DEAL",row.id,"record:read");
          allowed.push(row);
        }catch(e){if(!(e instanceof PermissionError))throw e;}
      }
      const tags=allowed.length?await tx.tagAssignment.findMany({
        where:{entityType:"DEAL",entityId:{in:allowed.map(r=>r.id)}},include:{tag:true},
      }):[];
      const tagMap:Record<string,TagRow[]>={};
      for(const t of tags)(tagMap[t.entityId]??=[]).push({
        id:t.tag.id,name:t.tag.name,color:t.tag.color});
      const now=Date.now();
      return{
        pipelines:pipelines.map(p=>({id:p.id,name:p.name,isDefault:p.isDefault})),
        activePipelineId:active.id,
        stages:stages.map(s=>({
          id:s.id,name:s.name,sortOrder:s.sortOrder,isWon:s.isWon,isLost:s.isLost,
          probability:s.probability,rottingDays:s.rotting_days,color:s.color,
        })),
        deals:allowed.map(d=>({
          id:d.id,name:d.name,stageId:d.stageId,
          amountCents:Number(d.amountCents),
          contactName:d.contact?[d.contact.firstName,d.contact.lastName].filter(Boolean).join(" "):null,
          daysInStage:Math.max(0,Math.floor((now-d.updatedAt.getTime())/86400000)),
          status:d.status,tags:tagMap[d.id]??[],
        })),
      };
  });
}
