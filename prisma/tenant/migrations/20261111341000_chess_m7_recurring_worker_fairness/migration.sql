-- M7: blocked/retry-unsafe recurring invoice plans must not monopolize
-- every future bounded scheduler run. This tracks only evaluation time;
-- it never constitutes invoice approval, delivery or cash settlement.
ALTER TABLE "ChessBillingSubscriptionPlan"
 ADD COLUMN "lastInspectedAt" TIMESTAMP(3);
CREATE INDEX "ChessBillingPlan_status_inspected_due_idx"
 ON "ChessBillingSubscriptionPlan"("status","lastInspectedAt","nextDraftAt");
