import { describe, expect, it } from "vitest";
import { secureBookingManageTokenMatches } from "./booking-manage-token";

describe("Round 48 public booking management token", () => {
  const token = "111122223333444455556666777788889999";
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
