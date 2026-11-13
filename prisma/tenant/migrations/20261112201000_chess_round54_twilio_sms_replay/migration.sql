-- Round 54: replay-safe provider message SID per direction. NULL values
-- remain permitted for messages created without a provider receipt.
-- A duplicate historical SID must be reconciled BEFORE applying this
-- migration in any non-disposable environment; do not auto-delete history.
CREATE UNIQUE INDEX "SmsMessage_direction_providerMessageSid_key"
ON "SmsMessage"("direction", "providerMessageSid");
