import { describe, expect, it } from "vitest";
import {
  financialAttemptBlocksConsentWithdrawal,
  financialAttemptTransitionAllowed,
} from "./bank-financial-attempt";

describe("durable CHESS financial attempt state machine", () => {
  it("allows only monotonic reservation, execution, unknown and terminal transitions", () => {
    expect(financialAttemptTransitionAllowed("RESERVED", "EXECUTING")).toBe(true);
    expect(financialAttemptTransitionAllowed("RESERVED", "CANCELLED")).toBe(true);
    expect(financialAttemptTransitionAllowed("EXECUTING", "UNKNOWN")).toBe(true);
    expect(financialAttemptTransitionAllowed("EXECUTING", "COMMITTED")).toBe(true);
    expect(financialAttemptTransitionAllowed("UNKNOWN", "COMMITTED")).toBe(true);
    expect(financialAttemptTransitionAllowed("UNKNOWN", "FAILED")).toBe(true);
    expect(financialAttemptTransitionAllowed("COMMITTED", "EXECUTING")).toBe(false);
    expect(financialAttemptTransitionAllowed("CANCELLED", "EXECUTING")).toBe(false);
    expect(financialAttemptTransitionAllowed("FAILED", "COMMITTED")).toBe(false);
  });

  it("blocks consent withdrawal only while a legacy write is in flight or ambiguous", () => {
    expect(financialAttemptBlocksConsentWithdrawal("RESERVED")).toBe(false);
    expect(financialAttemptBlocksConsentWithdrawal("EXECUTING")).toBe(true);
    expect(financialAttemptBlocksConsentWithdrawal("UNKNOWN")).toBe(true);
    expect(financialAttemptBlocksConsentWithdrawal("COMMITTED")).toBe(false);
    expect(financialAttemptBlocksConsentWithdrawal("FAILED")).toBe(false);
    expect(financialAttemptBlocksConsentWithdrawal("CANCELLED")).toBe(false);
  });
});
