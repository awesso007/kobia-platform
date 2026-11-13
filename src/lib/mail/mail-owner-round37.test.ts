import {describe,it,expect,vi} from "vitest";
import {getOwnedAccount,listAccounts} from "./queries";

describe("Round 37: historical mail ownership",()=>{
 it("does not load any account if an actor identity is missing",async()=>{
  const db={emailAccount:{
   findFirst:vi.fn(async()=>({id:"other-account"})),
   findMany:vi.fn(async()=>[{id:"other-account"}]),
  }};
  expect(await getOwnedAccount(db as never,"other-account",null)).toBeNull();
  expect(await listAccounts(db as never,null)).toEqual([]);
  expect(db.emailAccount.findFirst).not.toHaveBeenCalled();
  expect(db.emailAccount.findMany).not.toHaveBeenCalled();
 });
 it("filters account lookup and directory to the live owner",async()=>{
  const db={emailAccount:{
   findFirst:vi.fn(async()=>({id:"my-account",ownerClerkUserId:"owner-a"})),
   findMany:vi.fn(async()=>[]),
  }};
  expect(await getOwnedAccount(db as never,"my-account","owner-a")).toMatchObject({
   id:"my-account",
  });
  expect(db.emailAccount.findFirst).toHaveBeenCalledWith({
   where:{id:"my-account",ownerClerkUserId:"owner-a"},
  });
  await listAccounts(db as never,"owner-a");
  expect(db.emailAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({
   where:{ownerClerkUserId:"owner-a"},
  }));
 });
});
