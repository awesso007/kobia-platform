import {test} from "node:test";
import {strict as assert} from "node:assert";
import {validateDrIsolation,validateDrBackupMetadata} from "./chess-dr-policy.mjs";
const now=new Date("2026-11-11T19:00:00.000Z");
const source="postgresql://service:secret@primary.dr.invalid:5432/live?sslmode=require";
const clone="postgresql://restore:secret@isolated.dr.invalid:5432/restore?sslmode=require";
const allow="isolated.dr.invalid";
test("DR requires distinct named databases on isolated hosts and verified TLS",()=>{
 assert.equal(validateDrIsolation(source,clone,allow,"true").restored.hostname,allow);
 assert.throws(()=>validateDrIsolation(source,
  "postgresql://r:x@primary.dr.invalid/clone", "primary.dr.invalid","true"),
  /separate, isolated database host/);
 assert.throws(()=>validateDrIsolation(source,clone,allow,"false"),/verified TLS/);
 assert.throws(()=>validateDrIsolation(source,clone.replace("require","disable"),
  allow,"true"),/verified TLS/);
 assert.throws(()=>validateDrIsolation(source,clone,"evil.invalid","true"),/allowlist/);
});
const sample={VersionId:"v-test",ContentLength:150,
 ObjectLockMode:"COMPLIANCE",
 ObjectLockRetainUntilDate:new Date(now.getTime()+26*3600_000),
 ServerSideEncryption:"aws:kms",
 LastModified:new Date(now.getTime()-2*3600_000)};
test("DR requires a fresh immutable encrypted object at the exact backup version",()=>{
 assert.deepEqual(validateDrBackupMetadata(sample,"v-test",24,now),sample.LastModified);
 assert.throws(()=>validateDrBackupMetadata({...sample,VersionId:"other"},
  "v-test",24,now),/compliance locked/);
 assert.throws(()=>validateDrBackupMetadata({...sample,
  ObjectLockMode:"GOVERNANCE"},"v-test",24,now),/compliance locked/);
 assert.throws(()=>validateDrBackupMetadata({...sample,ServerSideEncryption:null},
  "v-test",24,now),/compliance locked/);
 assert.throws(()=>validateDrBackupMetadata({...sample,
  LastModified:new Date(now.getTime()-30*3600_000)},
  "v-test",24,now),/age window/);
 assert.throws(()=>validateDrBackupMetadata(sample,"v-test",100,now),
  /freshness threshold/);
});
