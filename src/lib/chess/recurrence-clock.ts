export type RecurrenceFrequency="DAILY"|"WEEKLY"|"MONTHLY";

/** All recurrence schedules use UTC to avoid silent DST changes.
 * anchorDay preserves the original intended day across short months. */
export function nextRecurrenceUtc(
  current:Date,frequency:RecurrenceFrequency,interval:number,anchorDay:number,
):Date{
  if(!Number.isInteger(interval)||interval<1||interval>12)
    throw new RangeError("Recurrence interval must be 1-12");
  if(!Number.isInteger(anchorDay)||anchorDay<1||anchorDay>31)
    throw new RangeError("Anchor day must be 1-31");
  if(!Number.isFinite(current.getTime()))throw new RangeError("Invalid recurrence date");
  if(frequency==="DAILY"||frequency==="WEEKLY"){
    const days=interval*(frequency==="WEEKLY"?7:1);
    const next=new Date(current.getTime());
    next.setUTCDate(next.getUTCDate()+days);
    return next;
  }
  if(frequency==="MONTHLY"){
    const year=current.getUTCFullYear();
    const nextMonth=current.getUTCMonth()+interval;
    const lastDay=new Date(Date.UTC(year,nextMonth+1,0)).getUTCDate();
    const day=Math.min(anchorDay,lastDay);
    return new Date(Date.UTC(year,nextMonth,day,
      current.getUTCHours(),current.getUTCMinutes(),current.getUTCSeconds(),current.getUTCMilliseconds()));
  }
  throw new RangeError("Unsupported recurrence frequency");
}
