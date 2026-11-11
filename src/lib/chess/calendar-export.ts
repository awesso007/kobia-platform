export type CalendarWorkItem={id:string;dueAt:Date|null;status:string;kind?:"TASK"|"APPOINTMENT"};
/** Read-only iCalendar export. No client names or restricted service details
 * leave the app in calendar event summaries. Calendar applications must use
 * the currently authenticated download rather than a public subscription. */
export function toPrivateChessCalendar(tasks:readonly CalendarWorkItem[],now=new Date()):string {
 const format=(d:Date)=>d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
 const lines=[
  "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//KOBIA//CHESS Operations Calendar//EN",
  "CALSCALE:GREGORIAN","METHOD:PUBLISH",
 ];
 for(const task of tasks){
  if(!task.dueAt || !Number.isFinite(task.dueAt.getTime()) ||
    task.status==="CANCELLED")continue;
  const end=new Date(task.dueAt.getTime()+30*60*1000);
  lines.push("BEGIN:VEVENT",
   `UID:${task.id}@chess-operations`,
   `DTSTAMP:${format(now)}`,
   `DTSTART:${format(task.dueAt)}`,
   `DTEND:${format(end)}`,
   task.kind==="APPOINTMENT"?"SUMMARY:CHESS appointment":"SUMMARY:CHESS work item",
   "DESCRIPTION:Open CHESS operations to view authorized details.",
   "CLASS:PRIVATE",
   "END:VEVENT");
 }
 lines.push("END:VCALENDAR");
 return lines.join("\r\n")+"\r\n";
}
