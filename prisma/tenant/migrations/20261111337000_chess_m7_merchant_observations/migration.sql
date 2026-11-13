-- M7 external merchant claims. These are NOT cash settlement evidence
-- and cannot post journal entries or update invoice payment status.
CREATE TABLE "ChessMerchantPaymentEvent" (
 "id" TEXT NOT NULL,
 "businessId" TEXT NOT NULL,
 "invoiceId" TEXT NOT NULL,
 "providerInvoiceId" TEXT NOT NULL,
 "providerEventId" TEXT NOT NULL,
 "eventKind" TEXT NOT NULL,
 "amountCents" BIGINT NOT NULL,
 "currency" TEXT NOT NULL DEFAULT 'USD',
 "eventDigest" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'OBSERVED',
 "occurredAt" TIMESTAMP(3) NOT NULL,
 "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChessMerchantPaymentEvent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ChessMerchantPaymentEvent_providerEventId_key"
  UNIQUE ("providerEventId")
);
CREATE INDEX "ChessMerchantPaymentEvent_businessId_invoiceId_receivedAt_idx"
 ON "ChessMerchantPaymentEvent"("businessId","invoiceId","receivedAt");
CREATE FUNCTION chess_reject_merchant_payment_event_tampering()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','UPDATE') THEN
  RAISE EXCEPTION 'Merchant observations are immutable event evidence';
 END IF;
 IF NEW."status"<>'OBSERVED' OR
    NEW."eventKind" NOT IN ('PAYMENT_CAPTURED','REFUND_OBSERVED','CHARGEBACK_OBSERVED') OR
    NEW."currency"<>'USD' OR
    NEW."amountCents"<=0 OR NEW."amountCents">1000000000000 OR
    NEW."eventDigest" !~ '^[0-9a-f]{64}$' OR
    length(NEW."providerEventId")<8 OR
    length(NEW."providerInvoiceId")<2 THEN
   RAISE EXCEPTION 'Invalid merchant observation evidence';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER chess_merchant_event_immutable
 BEFORE INSERT OR UPDATE OR DELETE ON "ChessMerchantPaymentEvent"
 FOR EACH ROW EXECUTE FUNCTION chess_reject_merchant_payment_event_tampering();
