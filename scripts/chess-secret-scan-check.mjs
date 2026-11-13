import assert from "node:assert/strict";
import {test} from "node:test";
import {scanSecretPatterns} from "./chess-secret-scan.mjs";
test("synthetic AWS key is detected without printing it",()=>{
 const fixture="AKIA"+"A".repeat(16);
 assert.deepEqual(scanSecretPatterns("prefix\n"+fixture),[{kind:"AWS access key",line:2}]);
});
test("documented placeholders are not credentials",()=>{
 assert.deepEqual(scanSecretPatterns("CLERK_SECRET_KEY=sk_test_placeholder"),[]);
});
test("synthetic PEM header is detected",()=>{
 assert.deepEqual(scanSecretPatterns("-----BEGIN "+"RSA PRIVATE KEY-----"),
  [{kind:"PEM private key",line:1}]);
});
