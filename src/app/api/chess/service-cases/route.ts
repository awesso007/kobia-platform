import {NextResponse} from "next/server";
import {z} from "zod";
import {openChessServiceCase} from "@/lib/chess/regulated-services";
import {PermissionError} from "@/lib/rbac/require-permission";
export const runtime="nodejs";
export async function POST(req:Request){
 try{return NextResponse.json({serviceCase:await openChessServiceCase(await req.json())},{status:201});}
 catch(e){return NextResponse.json({error:e instanceof PermissionError?"Forbidden":e instanceof z.ZodError?"Invalid request":"Request failed"},{status:e instanceof PermissionError?403:e instanceof z.ZodError?400:500});}
}
