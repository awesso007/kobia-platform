import {describe,expect,it} from "vitest";
import {isChessProtectedPath,applyChessSecurityHeaders,chessResponseSecurityHeaders}
 from "./private-response-headers";
describe("M8 sensitive operation transport headers",()=>{
 it("targets signed-in CRM and CHESS, not OAuth or public websites",()=>{
  for(const path of ["/app","/app/finance-operations",
   "/api/chess/billing","/api/chess/staging-attestation",
   "/api/client-profiles","/client-consents","/client-consents/consent-id"])expect(isChessProtectedPath(path)).toBe(true);
  for(const path of ["/api/webhooks/stripe","/pricing",
   "/api/auth/callback","/api/chess-evil"])
   expect(isChessProtectedPath(path)).toBe(false);
 });
 it("sets noncacheable, no-frame and nosniff headers",()=>{
  const response={headers:new Headers()};
  applyChessSecurityHeaders(response,"/api/chess/billing");
  for(const [key,value] of Object.entries(chessResponseSecurityHeaders))
   expect(response.headers.get(key)).toBe(value);
  const publicResponse={headers:new Headers()};
  applyChessSecurityHeaders(publicResponse,"/api/webhooks/stripe");
  expect([...publicResponse.headers.keys()]).toHaveLength(0);
 });
});
