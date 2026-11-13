-- M7 recurring plan may create invoice DRAFTS only, never initiate
-- a charge, send email, post GL entries or recognize revenue.
CREATE TABLE "ChessBillingSubscriptionPlan"(
 "id" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "clientProfileId" TEXT NOT NULL,
 "serviceCaseId" TEXT NOT NULL,
 "service" "ClientServiceArea" NOT NULL,
 "descriptionCode" TEXT NOT NULL,
 "amountCents" BIGINT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'USD',
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "nextDraftAt" TIMESTAMP(3) NOT NULL,
 "lastDraftAt" TIMESTAMP(3),
 "createdByClerkUserId" TEXT NOT NULL,
 "approvedByClerkUserId" TEXT,
 "approvedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChessBillingSubscriptionPlan_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChessBillingSubscriptionPlan_serviceCaseId_descriptionCode_key"
  UNIQUE ("serviceCaseId","descriptionCode"),
 CONSTRAINT "ChessBillingSubscriptionPlan_status_check"
  CHECK ("status" IN ('PENDING','ACTIVE','PAUSED','CANCELLED')),
 CONSTRAINT "ChessBillingSubscriptionPlan_amount_check"
  CHECK ("amountCents">0 AND "amountCents"<=1000000000 AND "currency"='USD')
);
CREATE INDEX "ChessBillingSubscriptionPlan_businessId_status_nextDraftAt_idx"
 ON "ChessBillingSubscriptionPlan"("businessId","status","nextDraftAt");
CREATE FUNCTION chess_reject_subscription_plan_tampering()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Recurring draft plan cannot be deleted';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW."status"<>'PENDING' OR NEW."approvedByClerkUserId" IS NOT NULL OR
     NEW."approvedAt" IS NOT NULL OR NEW."lastDraftAt" IS NOT NULL OR
     date_trunc('month',NEW."nextDraftAt")<>NEW."nextDraftAt" OR
     NEW."nextDraftAt"<=NEW."createdAt" THEN
   RAISE EXCEPTION 'Recurring draft plan must start PENDING at next full UTC month';
  END IF;
  RETURN NEW;
 END IF;
 IF OLD."id" IS DISTINCT FROM NEW."id" OR
    OLD."businessId" IS DISTINCT FROM NEW."businessId" OR
    OLD."clientProfileId" IS DISTINCT FROM NEW."clientProfileId" OR
    OLD."serviceCaseId" IS DISTINCT FROM NEW."serviceCaseId" OR
    OLD."service" IS DISTINCT FROM NEW."service" OR
    OLD."descriptionCode" IS DISTINCT FROM NEW."descriptionCode" OR
    OLD."amountCents" IS DISTINCT FROM NEW."amountCents" OR
    OLD."currency" IS DISTINCT FROM NEW."currency" OR
    OLD."createdByClerkUserId" IS DISTINCT FROM NEW."createdByClerkUserId" OR
    OLD."createdAt" IS DISTINCT FROM NEW."createdAt" THEN
  RAISE EXCEPTION 'Recurring plan scope or amount is immutable';
 END IF;
 IF OLD."status"='CANCELLED' OR
    (OLD."status"='PENDING' AND NEW."status"<>'ACTIVE') OR
    (OLD."status"='ACTIVE' AND NEW."status" NOT IN ('ACTIVE','PAUSED','CANCELLED')) OR
    (OLD."status"='PAUSED' AND NEW."status" NOT IN ('PAUSED','ACTIVE','CANCELLED')) THEN
  RAISE EXCEPTION 'Invalid recurring draft plan transition';
 END IF;
 IF OLD."status"='PENDING' AND (
    NULLIF(NEW."approvedByClerkUserId",'') IS NULL OR
    NEW."approvedByClerkUserId"=OLD."createdByClerkUserId" OR
    NEW."approvedAt" IS NULL) THEN
  RAISE EXCEPTION 'Subscription activation needs independent approval';
 END IF;
 IF OLD."approvedByClerkUserId" IS NOT NULL AND (
    OLD."approvedByClerkUserId" IS DISTINCT FROM NEW."approvedByClerkUserId" OR
    OLD."approvedAt" IS DISTINCT FROM NEW."approvedAt") THEN
  RAISE EXCEPTION 'Subscription approval evidence is immutable';
 END IF;
 IF OLD."nextDraftAt" IS DISTINCT FROM NEW."nextDraftAt" THEN
  IF OLD."status"<>'ACTIVE' OR NEW."status"<>'ACTIVE' OR
    NEW."nextDraftAt"<>OLD."nextDraftAt"+INTERVAL '1 month' OR
    NEW."lastDraftAt" IS DISTINCT FROM OLD."nextDraftAt" THEN
   RAISE EXCEPTION 'Recurring plan may advance exactly one month after draft creation';
  END IF;
 ELSIF OLD."lastDraftAt" IS DISTINCT FROM NEW."lastDraftAt" THEN
  RAISE EXCEPTION 'Recurring draft timestamp cannot change independently';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_billing_plan_guard
 BEFORE INSERT OR UPDATE OR DELETE ON "ChessBillingSubscriptionPlan"
 FOR EACH ROW EXECUTE FUNCTION chess_reject_subscription_plan_tampering();
