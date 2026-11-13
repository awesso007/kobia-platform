// Read-only staging deployment connectivity verification, no client records.
import {S3Client,HeadBucketCommand,GetBucketVersioningCommand} from "@aws-sdk/client-s3";
import {Client as PgClient} from "pg";
import {createConnection} from "node:net";

async function checkPostgres() {
 const client=new PgClient({connectionString:process.env.DIRECT_URL,
  connectionTimeoutMillis:7000,ssl:process.env.CHESS_VALIDATE_PG_SSL==="false"?false:undefined});
 await client.connect();
 try {
  const result=await client.query("select current_database() as name, 1 as ok");
  if(result.rows[0]?.ok!==1)throw new Error("PostgreSQL health check failed.");
 }finally{await client.end();}
 console.log("PASS PostgreSQL connectivity");
}
async function checkBucket() {
 const client=new S3Client({
  region:process.env.KOBIA_S3_REGION,
  endpoint:process.env.KOBIA_S3_ENDPOINT||undefined,
  forcePathStyle:!!process.env.KOBIA_S3_ENDPOINT,
  credentials:{
   accessKeyId:process.env.KOBIA_S3_ACCESS_KEY_ID,
   secretAccessKey:process.env.KOBIA_S3_SECRET_ACCESS_KEY,
  },
 });
 try {
  await client.send(new HeadBucketCommand({Bucket:process.env.KOBIA_S3_BUCKET}));
  const versioning=await client.send(new GetBucketVersioningCommand({Bucket:process.env.KOBIA_S3_BUCKET}));
  if(versioning.Status!=="Enabled")throw new Error("Sensitive documents require ENABLED S3 bucket versioning.");
  console.log("PASS private object-storage bucket connectivity and versioning");
 }finally{client.destroy();}
}
async function checkClamAv() {
 const port=Number(process.env.CHESS_CLAMAV_PORT||3310);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid ClamAV port");
 await new Promise((resolve,reject)=>{
  const socket=createConnection({host:process.env.CHESS_CLAMAV_HOST,port});
  socket.setTimeout(5000,()=>{socket.destroy();reject(new Error("ClamAV timeout"));});
  socket.once("error",reject);
  socket.once("connect",()=>socket.write("zPING\0"));
  socket.once("data",chunk=>{
   if(chunk.toString().startsWith("PONG")){socket.destroy();resolve();}
   else {socket.destroy();reject(new Error("ClamAV unexpected response"));}
  });
 });
 console.log("PASS ClamAV connectivity");
}
try{
 await checkPostgres();
 await checkBucket();
 await checkClamAv();
 console.log("Staging infrastructure connectivity checks PASS");
}catch(error){console.error("RELEASE BLOCKED:",error instanceof Error?error.message:String(error));process.exitCode=1;}
