/** Fail closed for an explicitly requested business that is not in the
 * current actor's authorized list; never silently switch to another unit. */
export function selectChessWorkspace<T extends {id:string}>(
 units:readonly T[],requestedId?:string,
):{status:"READY";selected:T}|{status:"NONE"|"UNAVAILABLE";selected:null}{
 if(requestedId){
  const selected=units.find(unit=>unit.id===requestedId);
  return selected?{status:"READY",selected}:{status:"UNAVAILABLE",selected:null};
 }
 const selected=units[0];
 return selected?{status:"READY",selected}:{status:"NONE",selected:null};
}
