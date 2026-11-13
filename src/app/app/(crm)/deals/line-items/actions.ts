"use server";

/**
 * Round 56: line items can modify a client's financial deal amount. Verify
 * the target deal, all children, product IDs, active service grants and staff
 * ownership in the same audited serializable transaction as price updates.
 * No direct unauthenticated recompute or foreign-item reorder.
 */
import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db/get-tenant-db";
import { getCurrentMembership, PermissionError } from "@/lib/rbac/require-permission";
import { dispatchAutomation } from "@/lib/automations/dispatch";
import { reindex } from "@/lib/search";
import { withLegacyCrmTransaction, assertLegacyCrmRecord } from "@/lib/chess/legacy-crm-security-round56";
import type { Prisma } from "@/lib/db/generated/tenant";

export type LineItemInput={
  productId?:string|null;name:string;description?:string|null;quantity?:number;
  unitPriceCents:number;discountPct?:number;taxRatePct?:number;
};
export type LineItemRow={
  id:string;productId:string|null;name:string;description:string|null;
  quantity:number;unitPriceCents:number;discountPct:number;taxRatePct:number;
  lineTotalCents:number;sortOrder:number;
};
export type ProductPick={id:string;sku:string;name:string;unitPriceCents:number;taxable:boolean};

async function actorId(){
  const m=await getCurrentMembership();
  if(!m||m.status!=="ACTIVE")throw new PermissionError("record:read");
  return m.clerkUserId;
}
function pct(n:number|undefined){
  const v=n??0;
  if(!Number.isFinite(v)||v<0||v>100)throw Error("Invalid percent.");
  return v;
}
function numberAmount(n:number){
  if(!Number.isSafeInteger(n)||n<0||n>1000000000000)
    throw Error("Invalid line item amount.");
  return n;
}
function quantity(n:number|undefined){
  const v=n??1;
  if(!Number.isFinite(v)||v<=0||v>1000000)
    throw Error("Invalid quantity.");
  return v;
}
async function validateProduct(tx:Prisma.TransactionClient,id:string|null|undefined){
  if(!id)return null;
  if(id.length>128)throw new PermissionError("record:update");
  const product=await tx.product.findFirst({
    where:{id,active:true},select:{id:true},
  });
  if(!product)throw new PermissionError("record:update");
  return id;
}
async function totalInTx(tx:Prisma.TransactionClient,dealId:string){
  const agg=await tx.dealLineItem.aggregate({
    where:{dealId},_sum:{lineTotalCents:true},
  });
  const amount=agg._sum.lineTotalCents??0;
  await tx.deal.update({where:{id:dealId},data:{amountCents:BigInt(amount)}});
  return amount;
}
async function committed(dealId:string,kind:"DEAL_AMOUNT_CHANGED"|"LINE_ITEM_ADDED"){
  const {db}=getTenantDb();
  await Promise.allSettled([
    dispatchAutomation({type:kind,entityType:"DEAL",
      entityId:dealId,changedFields:["amountCents","lineItems"]}),
    reindex(db,"DEAL",dealId),
  ]);
  revalidatePath("/app/deals");
}
export async function recomputeDealAmount(dealId:string):Promise<number>{
  const user=await actorId(),{db}=getTenantDb();
  const result=await withLegacyCrmTransaction(db,user,"record:update","DEAL",
    dealId,"LEGACY_DEAL_AMOUNT_RECOMPUTED",async(tx,actor)=>{
    await assertLegacyCrmRecord(tx,actor,"DEAL",dealId,"record:update");
    return totalInTx(tx,dealId);
  });
  await committed(dealId,"DEAL_AMOUNT_CHANGED");
  return result;
}
export async function createLineItem(dealId:string,input:LineItemInput):Promise<string>{
  if(!input||typeof input.name!=="string"||!input.name.trim()||
      input.name.length>200)throw Error("Invalid line item name.");
  const price=numberAmount(input.unitPriceCents),count=quantity(input.quantity);
  const discount=pct(input.discountPct),tax=pct(input.taxRatePct);
  const user=await actorId(),{db}=getTenantDb();
  const item=await withLegacyCrmTransaction(db,user,"record:update","DEAL",
    dealId,"LEGACY_DEAL_LINE_CREATED",async(tx,actor)=>{
    await assertLegacyCrmRecord(tx,actor,"DEAL",dealId,"record:update");
    const productId=await validateProduct(tx,input.productId);
    const max=await tx.dealLineItem.aggregate({where:{dealId},_max:{sortOrder:true}});
    const row=await tx.dealLineItem.create({data:{
      dealId,productId,name:input.name.trim(),
      description:input.description?.slice(0,2000).trim()||null,
      quantity:count,unitPriceCents:price,discountPct:discount,taxRatePct:tax,
      sortOrder:(max._max.sortOrder??-1)+1,
    },select:{id:true}});
    await totalInTx(tx,dealId);
    return row.id;
  });
  await committed(dealId,"LINE_ITEM_ADDED");
  return item;
}
export async function updateLineItem(id:string,input:Partial<LineItemInput>):Promise<void>{
  if(!input||typeof input!=="object")throw Error("Invalid line update.");
  const user=await actorId(),{db}=getTenantDb();
  const dealId=await withLegacyCrmTransaction(db,user,"record:update","DEAL",
    id,"LEGACY_DEAL_LINE_UPDATED",async(tx,actor)=>{
    const item=await tx.dealLineItem.findUnique({where:{id},select:{dealId:true}});
    if(!item)throw new PermissionError("record:update");
    await assertLegacyCrmRecord(tx,actor,"DEAL",item.dealId,"record:update");
    const data:Prisma.DealLineItemUncheckedUpdateInput={};
    if(input.productId!==undefined)data.productId=await validateProduct(tx,input.productId);
    if(input.name!==undefined){
      if(!input.name.trim()||input.name.length>200)throw Error("Invalid line item name.");
      data.name=input.name.trim();
    }
    if(input.description!==undefined)data.description=input.description?.slice(0,2000).trim()||null;
    if(input.quantity!==undefined)data.quantity=quantity(input.quantity);
    if(input.unitPriceCents!==undefined)data.unitPriceCents=numberAmount(input.unitPriceCents);
    if(input.discountPct!==undefined)data.discountPct=pct(input.discountPct);
    if(input.taxRatePct!==undefined)data.taxRatePct=pct(input.taxRatePct);
    await tx.dealLineItem.update({where:{id},data});
    await totalInTx(tx,item.dealId);
    return item.dealId;
  });
  await committed(dealId,"DEAL_AMOUNT_CHANGED");
}
export async function deleteLineItem(id:string):Promise<void>{
  const user=await actorId(),{db}=getTenantDb();
  const dealId=await withLegacyCrmTransaction(db,user,"record:update","DEAL",
    id,"LEGACY_DEAL_LINE_DELETED",async(tx,actor)=>{
    const item=await tx.dealLineItem.findUnique({where:{id},select:{dealId:true}});
    if(!item)throw new PermissionError("record:update");
    await assertLegacyCrmRecord(tx,actor,"DEAL",item.dealId,"record:update");
    await tx.dealLineItem.delete({where:{id}});
    await totalInTx(tx,item.dealId);
    return item.dealId;
  });
  await committed(dealId,"DEAL_AMOUNT_CHANGED");
}
export async function reorderLineItems(dealId:string,orderedIds:string[]):Promise<void>{
  if(!Array.isArray(orderedIds)||orderedIds.length>200||
      orderedIds.some(x=>typeof x!=="string"||x.length>128)||
      new Set(orderedIds).size!==orderedIds.length)
    throw new PermissionError("record:update");
  const user=await actorId(),{db}=getTenantDb();
  await withLegacyCrmTransaction(db,user,"record:update","DEAL",
    dealId,"LEGACY_DEAL_LINES_REORDERED",async(tx,actor)=>{
    await assertLegacyCrmRecord(tx,actor,"DEAL",dealId,"record:update");
    const existing=await tx.dealLineItem.findMany({
      where:{dealId},select:{id:true},take:201,
    });
    if(existing.length!==orderedIds.length||
       new Set(existing.map(x=>x.id)).size!==orderedIds.length||
       orderedIds.some(id=>!existing.some(row=>row.id===id)))
      throw new PermissionError("record:update");
    for(let i=0;i<orderedIds.length;i++)
      await tx.dealLineItem.update({where:{id:orderedIds[i]!},data:{sortOrder:i}});
  });
  revalidatePath("/app/deals");
}
export async function loadDealLineItems(dealId:string):Promise<{
  items:LineItemRow[];products:ProductPick[];
}>{
  const user=await actorId(),{db}=getTenantDb();
  return withLegacyCrmTransaction(db,user,"record:read","DEAL",
    dealId,"LEGACY_DEAL_LINE_ITEMS_READ",async(tx,actor)=>{
    await assertLegacyCrmRecord(tx,actor,"DEAL",dealId,"record:read");
    const [items,products]=await Promise.all([
      tx.dealLineItem.findMany({where:{dealId},
        orderBy:[{sortOrder:"asc"},{createdAt:"asc"}],take:200}),
      tx.product.findMany({where:{active:true},orderBy:{name:"asc"},take:250}),
    ]);
    return{
      items:items.map(i=>({id:i.id,productId:i.productId,
        name:i.name,description:i.description,quantity:Number(i.quantity),
        unitPriceCents:i.unitPriceCents,discountPct:Number(i.discountPct),
        taxRatePct:Number(i.taxRatePct),lineTotalCents:i.lineTotalCents,
        sortOrder:i.sortOrder})),
      products:products.map(p=>({id:p.id,sku:p.sku,name:p.name,
        unitPriceCents:p.unitPriceCents,taxable:p.taxable})),
    };
  });
}
