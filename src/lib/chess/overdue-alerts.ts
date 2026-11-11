import {getTenantDb} from "@/lib/db/get-tenant-db";

/** Deduplication uses the UTC date, so a 15-minute scheduler cannot
 * flood staff or managers with duplicate overdue reminders. */
export function overdueAlertKey(workItemId:string,date:Date,kind:"OVERDUE"|"BLOCKED",recipient:string){
 return `${kind.toLowerCase()}:${workItemId}:${date.toISOString().slice(0,10)}:${recipient}`;
}

export async function runChessOverdueAlerts(now=new Date()){
 const {db}=getTenantDb();
 const stale=new Date(now.getTime()-365*24*60*60*1000);
 const tasks=await db.chessWorkItem.findMany({
  where:{
   status:{in:["TODO","IN_PROGRESS","BLOCKED"]},
   dueAt:{gte:stale,lt:now},
  },
  select:{id:true,businessId:true,assignedClerkUserId:true,status:true},
  orderBy:{dueAt:"asc"},take:100,
 });
 const [units,assignments]=await Promise.all([
  db.chessBusinessUnit.findMany({where:{id:{in:[...new Set(tasks.map(t=>t.businessId))]},
   status:"ACTIVE"},select:{id:true}}),
  db.chessEmployeeAssignment.findMany({
   where:{businessId:{in:[...new Set(tasks.map(t=>t.businessId))]},revokedAt:null},
   select:{businessId:true,clerkUserId:true,role:true},
  }),
 ]);
 const liveUnits=new Set(units.map(u=>u.id));
 const employees=await db.membership.findMany({
  where:{clerkUserId:{in:[...new Set(assignments.map(a=>a.clerkUserId))]},status:"ACTIVE"},
  select:{clerkUserId:true},
 });
 const liveEmployees=new Set(employees.map(e=>e.clerkUserId));
 const alerts:{businessId:string;recipientClerkUserId:string;workItemId:string;
  type:string;message:string;dedupeKey:string}[]=[];
 for(const task of tasks){
  if(!liveUnits.has(task.businessId))continue;
  if(task.assignedClerkUserId&&liveEmployees.has(task.assignedClerkUserId) &&
   assignments.some(a=>a.businessId===task.businessId&&a.clerkUserId===task.assignedClerkUserId)){
   alerts.push({
    businessId:task.businessId,recipientClerkUserId:task.assignedClerkUserId,
    workItemId:task.id,type:"WORK_OVERDUE",
    message:"An assigned CHESS work item is overdue.",
    dedupeKey:overdueAlertKey(task.id,now,"OVERDUE",task.assignedClerkUserId),
   });
  }
  if(task.status==="BLOCKED"){
   for(const manager of assignments.filter(a=>a.businessId===task.businessId&&
    a.role==="MANAGER"&&liveEmployees.has(a.clerkUserId))){
    alerts.push({
     businessId:task.businessId,recipientClerkUserId:manager.clerkUserId,
     workItemId:task.id,type:"WORK_BLOCKED",
     message:"A CHESS work item needs manager review.",
     dedupeKey:overdueAlertKey(task.id,now,"BLOCKED",manager.clerkUserId),
    });
   }
  }
 }
 if(!alerts.length)return {examined:tasks.length,inserted:0};
 const inserted=await db.chessEmployeeAlert.createMany({data:alerts.slice(0,250),skipDuplicates:true});
 return {examined:tasks.length,inserted:inserted.count};
}
