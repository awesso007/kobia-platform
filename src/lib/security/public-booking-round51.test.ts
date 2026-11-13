import { describe, expect, it } from "vitest";
import { registeredPublicTenantSchema } from "./public-tenant";
import { PublicBookingError, publicBookingFailure } from "@/lib/calendar/public-booking";

describe("Round 51 public booking tenant and conflict handling", () => {
  it("allows only ACTIVE registry entries with exact schema and slug", () => {
    expect(registeredPublicTenantSchema("chess-demo", {
      status: "ACTIVE", schemaName: "tenant_chess_demo",
    })).toBe("tenant_chess_demo");
    for (const row of [null,
      { status: "SUSPENDED", schemaName: "tenant_chess_demo" },
      { status: "PROVISIONING", schemaName: "tenant_chess_demo" },
      { status: "ACTIVE", schemaName: "tenant_other" },
    ]) expect(registeredPublicTenantSchema("chess-demo", row)).toBeNull();
    for (const slug of ["", "UPPER", "../x", "tenant_other", "-bad", "bad.tenant"])
      expect(registeredPublicTenantSchema(slug, { status: "ACTIVE", schemaName: "tenant_" + slug })).toBeNull();
  });
  it("does not report serialization failure, inactive page or unavailable calendar as success", () => {
    expect(publicBookingFailure(new PublicBookingError("PAGE")).status).toBe(404);
    expect(publicBookingFailure(new PublicBookingError("SLOT")).status).toBe(409);
    expect(publicBookingFailure(new PublicBookingError("CALENDAR")).status).toBe(503);
    expect(publicBookingFailure({ code: "P2034" }).status).toBe(409);
    expect(publicBookingFailure(new Error("sensitive private tenant data"))).toEqual({
      status: 503, message: "Could not complete the booking. Please try again.",
    });
  });
});
