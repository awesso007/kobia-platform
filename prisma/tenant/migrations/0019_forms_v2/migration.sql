-- Sprint 19: Forms 2.0 - a richer form builder (multi-step wizards, conditional
-- field visibility, calculations, payment fields) in a NEW namespace so the
-- Sprint 5 simple Form/FormSubmission models keep serving legacy /forms/[slug].
--
-- Additive only: new enums and new tables. Applied per tenant schema via raw
-- SQL + search_path (scripts/apply-0019-acme.ts).

-- CreateEnum: Sprint 19 Forms 2.0 enums.
CREATE TYPE "FormV2Status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "FormFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'EMAIL', 'PHONE', 'NUMBER', 'DATE', 'DATETIME', 'SELECT', 'MULTISELECT', 'RADIO', 'CHECKBOX', 'FILE', 'RATING', 'SIGNATURE', 'HIDDEN', 'CALCULATED', 'PAYMENT', 'HEADING', 'PARAGRAPH');
CREATE TYPE "FormV2SubmissionStatus" AS ENUM ('PENDING', 'COMPLETED', 'PAID', 'FAILED');
CREATE TYPE "FormV2AnalyticsEvent" AS ENUM ('VIEW', 'STEP_ADVANCE', 'STEP_BACK', 'SUBMIT_ATTEMPT', 'SUBMIT_SUCCESS', 'PAYMENT_INIT', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED');

-- CreateTable FormV2.
CREATE TABLE "FormV2" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "FormV2Status" NOT NULL DEFAULT 'DRAFT',
    "successMessage" TEXT,
    "redirectUrl" TEXT,
    "submitButtonLabel" TEXT NOT NULL DEFAULT 'Submit',
    "theme" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FormV2_pkey" PRIMARY KEY ("id")
);

-- CreateTable FormStep.
CREATE TABLE "FormStep" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "FormStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable FormField.
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "stepId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL DEFAULT 'SHORT_TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "placeholder" TEXT,
    "helpText" TEXT,
    "options" JSONB,
    "validation" JSONB,
    "defaultValue" TEXT,
    "calculation" TEXT,
    "paymentAmount" INTEGER,
    "paymentCurrency" TEXT NOT NULL DEFAULT 'USD',
    "paymentDescription" TEXT,
    "visibilityRule" JSONB,
    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable FormV2Submission.
CREATE TABLE "FormV2Submission" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "status" "FormV2SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "data" JSONB NOT NULL,
    "meta" JSONB,
    "leadId" TEXT,
    "contactId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormV2Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable FormV2Analytics.
CREATE TABLE "FormV2Analytics" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "stepId" TEXT,
    "event" "FormV2AnalyticsEvent" NOT NULL,
    "path" TEXT,
    "referrer" TEXT,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormV2Analytics_pkey" PRIMARY KEY ("id")
);

-- Indexes.
CREATE UNIQUE INDEX "FormV2_slug_key" ON "FormV2"("slug");
CREATE INDEX "FormV2_status_idx" ON "FormV2"("status");
CREATE INDEX "FormStep_formId_idx" ON "FormStep"("formId");
CREATE UNIQUE INDEX "FormField_formId_key_key" ON "FormField"("formId", "key");
CREATE INDEX "FormField_formId_idx" ON "FormField"("formId");
CREATE INDEX "FormField_stepId_idx" ON "FormField"("stepId");
CREATE INDEX "FormV2Submission_formId_idx" ON "FormV2Submission"("formId");
CREATE INDEX "FormV2Submission_status_idx" ON "FormV2Submission"("status");
CREATE INDEX "FormV2Analytics_formId_idx" ON "FormV2Analytics"("formId");
CREATE INDEX "FormV2Analytics_event_idx" ON "FormV2Analytics"("event");

-- Foreign keys.
ALTER TABLE "FormStep" ADD CONSTRAINT "FormStep_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "FormStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormV2Submission" ADD CONSTRAINT "FormV2Submission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormV2Analytics" ADD CONSTRAINT "FormV2Analytics_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormV2"("id") ON DELETE CASCADE ON UPDATE CASCADE;
