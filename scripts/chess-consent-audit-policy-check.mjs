import {test} from "node:test";
import assert from "node:assert/strict";
import {consentAuditConfiguration,aggregateConsentAuditRows} from
 "./chess-consent-audit-policy.mjs";
test("strict protected audit config with no permissive TLS fallback",()=>{
 const env={CHESS_CONSENT_AUDIT_ENABLED:"true",CHESS_CONSENT_AUDIT_ISOLATED:"true",
  CHESS_CONSENT_AUDIT_TENANT:"fictional-tenant",
  CHESS_CONSENT_AUDIT_ALLOWED_HOST:"db.example.test",
  CHESS_CONSENT_AUDIT_DATABASE_URL:
   "postgresql://reader:placeholder@db.example.test:5432/staging?sslmode=verify-full",
  CHESS_CONSENT_AUDIT_REVIEW_TICKET:"REVIEW_12345"};
 const o=consentAuditConfiguration(env);
 assert.equal(o.schema,"tenant_fictional_tenant");
 assert.throws(()=>consentAuditConfiguration({...env,
  CHESS_CONSENT_AUDIT_ENABLED:"false"}));
 assert.throws(()=>consentAuditConfiguration({...env,
  CHESS_CONSENT_AUDIT_TENANT:"../another"}));
 assert.throws(()=>consentAuditConfiguration({...env,
  CHESS_CONSENT_AUDIT_DATABASE_URL:
   "postgresql://reader:placeholder@evil.example/staging?sslmode=verify-full"}));
 assert.throws(()=>consentAuditConfiguration({...env,
  CHESS_CONSENT_AUDIT_DATABASE_URL:
   "postgresql://reader:placeholder@db.example.test/staging?sslmode=disable"}));
});
test("only bounded anonymous aggregate counts leave the isolated validator",()=>{
 const good=aggregateConsentAuditRows([{status:"PENDING",
  total:4,malformedGrant:0,pendingWithEvidence:0,
  expiredStillGranted:0,otherInvalid:0}]);
 assert.equal(good.issues,0);
 const suspect=aggregateConsentAuditRows([{status:"GRANTED",
  total:4,malformedGrant:2,pendingWithEvidence:0,
  expiredStillGranted:1,otherInvalid:0}]);
 assert.equal(suspect.issues,3);
 assert.deepEqual(Object.keys(suspect.summary).sort(),
  ["total","malformedGrant","pendingWithEvidence","expiredStillGranted","otherInvalid"].sort());
 assert.throws(()=>aggregateConsentAuditRows([{status:"UNKNOWN",total:1}]));
 assert.throws(()=>aggregateConsentAuditRows([{status:"PENDING",
  total:-1,malformedGrant:0,pendingWithEvidence:0,
  expiredStillGranted:0,otherInvalid:0}]));
});
