import { describe, expect, it } from "vitest";
import { readBoundedTwilioParams, twilioAccountMatches } from "./legacy-webhook-tenant";
const sid = "AC" + "a".repeat(32);
function formReq(body: string, type = "application/x-www-form-urlencoded") {
  return new Request("https://example.test/api/webhooks/twilio/sms?tenant=chess-demo", {
    method: "POST", headers: { "Content-Type": type }, body,
  });
}
describe("Round 54 machine webhook ingress", () => {
  it("accepts one bounded form field per unique key", async () => {
    const values = await readBoundedTwilioParams(formReq("AccountSid=" + sid + "&From=%2B15555550100"));
    expect(values.AccountSid).toBe(sid);
    expect(values.From).toBe("+15555550100");
  });
  it("rejects duplicate fields, unbounded body and arbitrary content-type", async () => {
    await expect(readBoundedTwilioParams(formReq("From=one&From=other"))).rejects.toThrow();
    await expect(readBoundedTwilioParams(formReq("x=" + "x".repeat(17000)))).rejects.toThrow();
    await expect(readBoundedTwilioParams(formReq('{"From":"x"}', "application/json"))).rejects.toThrow();
  });
  it("requires the exact configured account SID, not just a signed URL", () => {
    expect(twilioAccountMatches(sid, sid)).toBe(true);
    expect(twilioAccountMatches(sid, "AC" + "b".repeat(32))).toBe(false);
    expect(twilioAccountMatches(undefined, sid)).toBe(false);
    expect(twilioAccountMatches(sid, undefined)).toBe(false);
  });
});
