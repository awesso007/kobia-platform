import {NextResponse} from "next/server";
import {mayReadStagingAttestation,validReleaseSha}
 from "@/lib/chess/staging-attestation";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store","Pragma":"no-cache"};

/** Deploy-specific identity check. No tenant data or secrets in response.
 * This is a self-reported release marker, NOT an independent supply-chain
 * provenance attestation or proof the staging rollout is correctly wired. */
export async function GET(request:Request){
 const config={
  enabled:process.env.CHESS_STAGING_ATTESTATION_ENABLED,
  token:process.env.CHESS_STAGING_ATTESTATION_TOKEN,
  releaseSha:process.env.CHESS_RELEASE_SHA,
 };
 if(!mayReadStagingAttestation(request.headers.get("authorization"),config))
  return NextResponse.json({error:"Forbidden"},{status:403,headers});
 if(!validReleaseSha(config.releaseSha))
  return NextResponse.json({error:"Unavailable"},{status:503,headers});
 return NextResponse.json({releaseSha:config.releaseSha,environment:"staging"},{
  headers,
 });
}
