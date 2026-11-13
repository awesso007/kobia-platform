/** Preserve spreadsheet formula prefixes as literal text. */
export function quoteChessCsvCell(raw:string):string{
 const safe=/^\s*[=+@\-]/u.test(raw)?"'"+raw:raw;
 return '"'+safe.replaceAll('"','""')+'"';
}
/** Format exact USD integer cents without Number precision loss. */
export function formatChessUsdCents(raw:string):string{
 if(!/^-?\d{1,24}$/.test(raw))throw new RangeError("Invalid USD cents.");
 const value=BigInt(raw),neg=value<0n,abs=neg?-value:value;
 const dollars=(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",");
 return (neg?"-":"")+"$"+dollars+"."+(abs%100n).toString().padStart(2,"0");
}
