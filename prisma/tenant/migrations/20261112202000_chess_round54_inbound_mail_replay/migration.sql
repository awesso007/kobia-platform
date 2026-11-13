-- Round 54: reject retried signed relay Message-ID per active account+direction.
-- NULL external IDs are allowed for unrelated outbound/local drafts.
-- Reconcile any historical duplicate Message-IDs before deploying to real data.
CREATE UNIQUE INDEX "EmailMessage_accountId_direction_externalId_key"
ON "EmailMessage"("accountId", "direction", "externalId");
