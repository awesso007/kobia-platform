import { describe, expect, it } from "vitest";
import { secureBookingManageTokenMatches } from "./booking-manage-token";

describe("Round 48 public booking management token", () => {
  const token = "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c";
  it("accepts exact issued opaque 18-byte hex tokens", () => {
    expect(secureBookingManageTokenMatches(token, token)).toBe(true);
  });
  it("rejects weak, missing, malformed and different tokens", () => {
    for (const value of [null, undefined, "", "secret", token + "0", token.slice(0, -1), token.slice(0, -1) + "0", token.toUpperCase()]) {
      expect(secureBookingManageTokenMatches(value, token)).toBe(false);
    }
    expect(secureBookingManageTokenMatches(token, "short")).toBe(false);
  });
});
