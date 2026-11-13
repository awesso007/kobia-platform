import { describe, expect, it, vi } from "vitest";
import {
  legacyMachineBusinessAllowed, requireSingleLegacyMachineBusiness,
} from "./legacy-machine-business-round55";

describe("Round 55 machine resource authorization", () => {
  it("denies multi-business, including historically inactive business, and inactive-only tenant", () => {
    expect(legacyMachineBusinessAllowed([])).toBe(true); // Pre-business legacy demo.
    expect(legacyMachineBusinessAllowed([{status:"ACTIVE"}])).toBe(true);
    expect(legacyMachineBusinessAllowed([{status:"INACTIVE"}])).toBe(false);
    expect(legacyMachineBusinessAllowed([{status:"ACTIVE"},{status:"ACTIVE"}])).toBe(false);
    expect(legacyMachineBusinessAllowed([{status:"ACTIVE"},{status:"INACTIVE"}])).toBe(false);
  });
  it("fails closed on absent/foreign scope and database errors", async () => {
    const findMany=vi.fn().mockResolvedValueOnce([{id:"a",status:"ACTIVE"}])
      .mockResolvedValueOnce([{id:"a",status:"ACTIVE"},{id:"b",status:"INACTIVE"}])
      .mockRejectedValueOnce(new Error("DB unavailable"));
    const db={chessBusinessUnit:{findMany}};
    await expect(requireSingleLegacyMachineBusiness(db as never)).resolves.toBeUndefined();
    await expect(requireSingleLegacyMachineBusiness(db as never))
      .rejects.toThrow("business ownership unavailable");
    await expect(requireSingleLegacyMachineBusiness(db as never))
      .rejects.toThrow("DB unavailable");
    expect(findMany).toHaveBeenCalledWith({select:{id:true,status:true},take:2});
  });
});
