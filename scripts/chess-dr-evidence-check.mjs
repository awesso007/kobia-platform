import {test} from "node:test";
import {strict as assert} from "node:assert";
import {validateDrRecoveryEvidence} from "./chess-dr-evidence.mjs";
const data={
 startedAt:"2026-11-11T12:00:00Z",
 restoreReadyAt:"2026-11-11T12:22:00Z",
 sourceLatestAt:"2026-11-11T12:10:00Z",
 restoredLatestAt:"2026-11-11T12:06:00Z",
 rtoTargetMinutes:"30",rpoTargetMinutes:"5",
 evidenceTicket:"DR-ISOLATED-1234",
};
const now=Date.parse("2026-11-11T13:00:00Z");
test("DR computes bounded operator timing evidence without trusting future times",()=>{
 assert.deepEqual(validateDrRecoveryEvidence(data,now),{
  rtoMinutes:22,rpoMinutes:4,rtoTargetMinutes:30,rpoTargetMinutes:5,
 });
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,restoreReadyAt:"2026-11-11T12:40:00Z"
 },now),/RTO\/RPO targets/);
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,restoredLatestAt:"2026-11-11T12:00:00Z"
 },now),/RTO\/RPO targets/);
});
test("DR rejects impossible or untraceable recovery evidence",()=>{
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,restoreReadyAt:"2026-11-11T11:59:00Z"
 },now),/inconsistent/);
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,evidenceTicket:""
 },now),/evidence reference/);
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,sourceLatestAt:"2026-11-11T12:03:00Z"
 },now),/inconsistent/);
 assert.throws(()=>validateDrRecoveryEvidence({
  ...data,startedAt:"2026-11-11T14:00:00Z"
 },now),/future-dated/);
});
