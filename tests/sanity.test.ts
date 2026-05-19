import { describe, it, expect } from "vitest";
import { shouldShowKobiaBrand } from "@/lib/tenant";

describe("shouldShowKobiaBrand (Lock EEEE)", () => {
  it("shows on FREE tier", () => {
    expect(
      shouldShowKobiaBrand({ tier: "FREE", hideKobiaBrand: false } as never),
    ).toBe(true);
  });
  it("shows on ENTRY tier even if hideKobiaBrand=true", () => {
    expect(
      shouldShowKobiaBrand({ tier: "ENTRY", hideKobiaBrand: true } as never),
    ).toBe(true);
  });
  it("hides on SOLO tier by default", () => {
    expect(
      shouldShowKobiaBrand({ tier: "SOLO", hideKobiaBrand: true } as never),
    ).toBe(false);
  });
  it("hides on FIRM tier", () => {
    expect(
      shouldShowKobiaBrand({ tier: "FIRM", hideKobiaBrand: true } as never),
    ).toBe(false);
  });
});
