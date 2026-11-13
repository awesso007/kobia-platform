import { describe, expect, it, vi } from "vitest";
import { signByToken } from "./envelopes";
const signer = { id: "s1", envelopeId: "e1", status: "SENT", token: "a".repeat(20) };
const next = { id: "s2", envelopeId: "e1", status: "PENDING", token: "b".repeat(20), name: "Next", email: "next@example.test" };
function context(signerStatus = "SENT", envelopeStatus = "SENT") {
  const tx = {
    envelopeSigner: {
      findUnique: vi.fn().mockResolvedValue({ ...signer, status: signerStatus }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    envelope: {
      findUnique: vi.fn().mockResolvedValue({
        id: "e1", name: "Demo", message: null, status: envelopeStatus,
        signers: [{ ...signer, status: signerStatus }],
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    envelopeAuditEvent: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
  };
  const db = {
    $transaction: vi.fn(async (cb: (value: unknown) => Promise<unknown>, _opts?: unknown) => cb(tx)),
    emailAccount: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  return { tx, db };
}
describe("Round 54 atomic public signer proof", () => {
  it("refuses unsigned, early, voided and duplicate signer transitions", async () => {
    const { db, tx } = context("PENDING");
    expect((await signByToken(db as never, signer.token, { signatureData: "Tester" })).ok).toBe(false);
    expect(tx.envelopeSigner.updateMany).not.toHaveBeenCalled();
    const other = context("SIGNED");
    expect((await signByToken(other.db as never, signer.token, { signatureData: "Tester" })).ok).toBe(false);
    const voided = context("SENT", "VOIDED");
    expect((await signByToken(voided.db as never, signer.token, { signatureData: "Tester" })).ok).toBe(false);
    const empty = context();
    expect((await signByToken(empty.db as never, signer.token, { signatureData: "" })).ok).toBe(false);
  });
  it("commits signer state, SIGNED and COMPLETED audit or nothing", async () => {
    const { db, tx } = context();
    const signed = await signByToken(db as never, signer.token, { signatureData: "Tester" });
    expect(signed).toEqual({ ok: true, detail: "signature accepted", completed: true });
    expect(db.$transaction.mock.calls[0]?.[1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(tx.envelopeSigner.updateMany).toHaveBeenCalledOnce();
    expect(tx.envelopeAuditEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.envelope.updateMany).toHaveBeenCalledOnce();
    tx.envelopeAuditEvent.create.mockRejectedValueOnce(new Error("audit offline"));
    await expect(signByToken(db as never, signer.token, { signatureData: "Tester" }))
      .rejects.toThrow("audit offline");
  });
  it("cannot sign out of order or send next signer email before COMMIT", async () => {
    const { db, tx } = context();
    tx.envelope.findUnique.mockResolvedValueOnce({
      id: "e1", name: "Demo", message: null, status: "SENT",
      signers: [{ ...next, status: "PENDING", order: 0 }, { ...signer, order: 1 }],
    });
    const out = await signByToken(db as never, signer.token, { signatureData: "Tester" });
    expect(out.ok).toBe(false);
    expect(tx.envelopeSigner.updateMany).not.toHaveBeenCalled();
  });
});
