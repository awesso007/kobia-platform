import {describe,it,expect} from "vitest";
import {closedOperationalMonth,operationalSnapshotDigest,
 independentOperationalReviewer} from "./operational-close";

describe("M7 operational snapshot policy",()=>{
 it("only freezes completed UTC months",()=>{
  const date=new Date("2026-11-11T12:00:00.000Z");
  expect(closedOperationalMonth("2026-10",date)).toBe(true);
  expect(closedOperationalMonth("2026-11",date)).toBe(false);
  expect(closedOperationalMonth("2026-12",date)).toBe(false);
 });
 it("binds evidence to tenant, unit, period and full frozen payload",()=>{
  const v={tenantSlug:"tenant-a",businessId:"unit-a",
   month:"2026-10",reportJson:'{"counts":3}'};
  const digest=operationalSnapshotDigest(v);
  expect(digest).toMatch(/^[a-f0-9]{64}$/);
  expect(digest).not.toBe(operationalSnapshotDigest({...v,tenantSlug:"tenant-b"}));
  expect(digest).not.toBe(operationalSnapshotDigest({...v,reportJson:'{"counts":4}'}));
  expect(digest).not.toBe(operationalSnapshotDigest({...v,month:"2026-09"}));
 });
 it("requires a different active administrator to review",()=>{
  expect(independentOperationalReviewer("author","author","OWNER")).toBe(false);
  expect(independentOperationalReviewer("author","other","MEMBER")).toBe(false);
  expect(independentOperationalReviewer("author","other","ADMIN")).toBe(true);
 });
});
