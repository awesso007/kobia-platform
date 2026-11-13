import {describe,it,expect,vi} from "vitest";
import {
 LEGACY_HELPDESK_EMAIL_ONLY_DISABLED,openPortalSession,validatePortalSession,
} from "./portal";

describe("Round 37: legacy helpdesk email impersonation guard",()=>{
 it("refuses to issue a cookie merely because a contact email is known",async()=>{
  const db={
   contact:{findFirst:vi.fn(async()=>({id:"private-client"}))},
   customerPortalSession:{create:vi.fn(async()=>({token:"private-cookie"}))},
  };
  expect(LEGACY_HELPDESK_EMAIL_ONLY_DISABLED).toBe(true);
  expect(await openPortalSession(db as never,"victim@example.test")).toBeNull();
  expect(db.contact.findFirst).not.toHaveBeenCalled();
  expect(db.customerPortalSession.create).not.toHaveBeenCalled();
 });
 it("rejects old sessions until independently verified identity is implemented",async()=>{
  const db={
   customerPortalSession:{
    findUnique:vi.fn(async()=>({contactId:"victim",email:"victim@example.test"})),
    update:vi.fn(async()=>({})),
   },
  };
  expect(await validatePortalSession(db as never,"stolen-legacy-cookie")).toBeNull();
  expect(db.customerPortalSession.findUnique).not.toHaveBeenCalled();
 });
});
