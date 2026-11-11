import {describe,it,expect} from "vitest";
import {canReviewAction} from "./approvals";
describe("AI / financial action approval",()=>{
 it("prevents self approval",()=>expect(canReviewAction("a","a","OWNER")).toBe(false));
 it("denies staff reviewer",()=>expect(canReviewAction("a","b","MEMBER")).toBe(false));
 it("accepts distinct admin reviewer",()=>expect(canReviewAction("a","b","ADMIN")).toBe(true));
});
