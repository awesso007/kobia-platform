/** Default protections for private CHESS operations and CRM surfaces.
 * Do not apply these to third-party OAuth callbacks or public webhooks. */
export function isChessProtectedPath(pathname:string):boolean{
 return /^\/app(?:\/|$)/.test(pathname)||
  /^\/api\/chess(?:\/|$)/.test(pathname)||
  /^\/api\/(?:client-profiles|client-service-links)(?:\/|$)/.test(pathname);
}
export const chessResponseSecurityHeaders=Object.freeze({
 "Cache-Control":"private, no-store, max-age=0",
 "Pragma":"no-cache",
 "X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
 "X-Frame-Options":"DENY",
 "Cross-Origin-Resource-Policy":"same-origin",
 "Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()",
 "Content-Security-Policy":"frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
});
export function applyChessSecurityHeaders(response:{headers:Headers},path:string):void{
 if(!isChessProtectedPath(path))return;
 for(const [key,value] of Object.entries(chessResponseSecurityHeaders))
  response.headers.set(key,value);
}
