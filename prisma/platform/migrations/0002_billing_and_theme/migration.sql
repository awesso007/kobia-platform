-- Sprint 5: Stripe billing scaffolding on tenant_registry + per-tenant theme +
-- BillingEvent webhook log. Additive only: new nullable columns + new table.
-- No DROP on existing data.

-- AlterTable
ALTER TABLE "tenant_registry" ADD COLUMN "stripe_customer_id" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "stripe_subscription_id" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "subscription_status" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "subscription_renews_at" TIMESTAMP(3);
ALTER TABLE "tenant_registry" ADD COLUMN "trial_ends_at" TIMESTAMP(3);
ALTER TABLE "tenant_registry" ADD COLUMN "seats_purchased" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "tenant_registry" ADD COLUMN "seats_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenant_registry" ADD COLUMN "billing_email" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "theme" JSONB;
ALTER TABLE "tenant_registry" ADD COLUMN "display_name" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "timezone" TEXT;
ALTER TABLE "tenant_registry" ADD COLUMN "logo_url" TEXT;

-- CreateTable
CREATE TABLE "billing_event" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_event_tenant_id_created_at_idx" ON "billing_event"("tenant_id", "created_at");
