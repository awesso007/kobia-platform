import { describe, expect, it, vi } from "vitest";
import { PermissionError } from "@/lib/rbac/require-permission";
import {
  assertLegacyCrmRecord, legacyCompanyClientAccess,
  legacyContactClientAccess, verifyLegacyCrmCreateOwner,
  withLegacyCrmTransaction,
} from "./legacy-crm-security-round56";

function mockCtx(opts: {
  role?: "OWNER"|"ADMIN"|"MEMBER"|"VIEWER";
  businessUnits?: { id:string;status:string }[];
  clientProfile?: string|null;
  grant?: boolean;
  owner?: string|null;
  companyContacts?: string[];
  auditFails?: boolean;
}={}) {
  const owner=opts.owner===undefined?"actor-a":opts.owner;
  const member={role:opts.role??"OWNER",status:"ACTIVE"};
  const tx={
    membership:{findUnique:vi.fn().mockResolvedValue(member)},
    chessBusinessUnit:{findMany:vi.fn().mockResolvedValue(
      opts.businessUnits??[{id:"business-a",status:"ACTIVE"}],
    )},
    chessEmployeeAssignment:{findUnique:vi.fn().mockResolvedValue({revokedAt:null})},
    clientProfile:{findUnique:vi.fn().mockResolvedValue(
      opts.clientProfile===null?null:{id:opts.clientProfile??"client-x"},
    )},
    clientServiceLink:{findFirst:vi.fn().mockResolvedValue(
      opts.grant===false?null:{id:"service-link-a"},
    )},
    contact:{findUnique:vi.fn().mockResolvedValue({ownerUserId:owner,companyId:null}),
      count:vi.fn().mockResolvedValue(opts.companyContacts?.length??0),
      findMany:vi.fn().mockResolvedValue(
        (opts.companyContacts??[]).map(id=>({id})),
      )},
    deal:{findUnique:vi.fn().mockResolvedValue({
      ownerUserId:owner,contactId:"contact-x",companyId:null,
    })},
    company:{findUnique:vi.fn().mockResolvedValue({ownerUserId:owner})},
    lead:{findUnique:vi.fn().mockResolvedValue({ownerUserId:owner})},
    chessSecurityEvent:{create:vi.fn().mockImplementation(async()=>{
      if(opts.auditFails)throw Error("security audit unavailable");
      return{id:"receipt"};
    })},
  };
  const db={$transaction:vi.fn(async (cb:(tx:unknown)=>Promise<unknown>)=>cb(tx))};
  return {tx,db};
}
describe("Round 56 live cross-client CRM permission checks",()=>{
  it("rejects a revoked service grant even for a tenant OWNER",async()=>{
    const {tx}=mockCtx({grant:false});
    await expect(legacyContactClientAccess(tx as never,{id:"actor-a",role:"OWNER",businessId:"business-a"},
      "contact-x",false)).rejects.toBeInstanceOf(PermissionError);
    expect(tx.clientServiceLink.findFirst).toHaveBeenCalledWith({
      where:{profileId:"client-x",businessId:"business-a",
        grants:{some:{clerkUserId:"actor-a",revokedAt:null,canRead:true}}},
      select:{id:true},
    });
    const denied=mockCtx({grant:false});
    await expect(assertLegacyCrmRecord(denied.tx as never,
      {id:"actor-a",role:"OWNER",businessId:"business-a"},
      "DEAL","deal-a","record:update")).rejects.toBeInstanceOf(PermissionError);
  });
  it("requires canWrite for a client-contact mutation; ordinary contacts need no client grant",async()=>{
    const linked=mockCtx();
    await legacyContactClientAccess(linked.tx as never,
      {id:"actor-a",role:"OWNER",businessId:"business-a"},"contact-x",true);
    expect(linked.tx.clientServiceLink.findFirst).toHaveBeenCalledWith({
      where:{profileId:"client-x",businessId:"business-a",
        grants:{some:{clerkUserId:"actor-a",revokedAt:null,canRead:true,canWrite:true}}},
      select:{id:true},
    });
    const plain=mockCtx({clientProfile:null,grant:false});
    await expect(legacyContactClientAccess(plain.tx as never,
      {id:"actor-a",role:"OWNER",businessId:"business-a"},"contact-x",true))
      .resolves.toBeUndefined();
    expect(plain.tx.clientServiceLink.findFirst).not.toHaveBeenCalled();
  });
  it("blocks member from reading another owner's contact and all member delete",async()=>{
    const ctx=mockCtx({role:"MEMBER",owner:"different-user"});
    const actor={id:"actor-a",role:"MEMBER" as const,businessId:"business-a"};
    await expect(assertLegacyCrmRecord(ctx.tx as never,actor,
      "CONTACT","contact-x","record:read")).rejects.toBeInstanceOf(PermissionError);
    const mine=mockCtx({role:"MEMBER"});
    await expect(assertLegacyCrmRecord(mine.tx as never,actor,
      "CONTACT","contact-x","record:delete")).rejects.toBeInstanceOf(PermissionError);
  });
  it("rejects a company aggregating even one unauthorized client",async()=>{
    const ctx=mockCtx({companyContacts:["contact-a","contact-b"],grant:false});
    await expect(legacyCompanyClientAccess(ctx.tx as never,
      {id:"actor-a",role:"OWNER",businessId:"business-a"},"company-a",false))
      .rejects.toBeInstanceOf(PermissionError);
  });
  it("blocks non-member/foreign target ownership and revoked business assignments",async()=>{
    const ctx=mockCtx({role:"MEMBER"});
    await expect(verifyLegacyCrmCreateOwner(ctx.tx as never,
      {id:"actor-a",role:"MEMBER",businessId:"business-a"},"someone-else"))
      .rejects.toBeInstanceOf(PermissionError);
    const banned=mockCtx();
    banned.tx.chessEmployeeAssignment.findUnique.mockResolvedValue(null);
    await expect(verifyLegacyCrmCreateOwner(banned.tx as never,
      {id:"actor-a",role:"OWNER",businessId:"business-a"},"actor-b"))
      .rejects.toBeInstanceOf(PermissionError);
  });
  it("never returns a sensitive result when the same-transaction audit insert fails",async()=>{
    const ctx=mockCtx({auditFails:true});
    await expect(withLegacyCrmTransaction(ctx.db as never,"actor-a","record:read",
      "CONTACT","contact-x","CONTACT_SECRET_READ",async(tx,actor)=>{
        await assertLegacyCrmRecord(tx,actor,"CONTACT","contact-x","record:read");
        return {email:"private@client.invalid"};
      })).rejects.toThrow("security audit unavailable");
    expect(ctx.db.$transaction).toHaveBeenCalledWith(expect.any(Function),
      expect.objectContaining({isolationLevel:"Serializable"}));
  });
  it("refuses all legacy CRM without historical single business ownership",async()=>{
    const ctx=mockCtx({businessUnits:[
      {id:"business-a",status:"ACTIVE"},{id:"business-b",status:"INACTIVE"},
    ]});
    await expect(withLegacyCrmTransaction(ctx.db as never,"actor-a","record:read",
      "COMPANY","list","COMPANY_LIST",async()=>[]))
      .rejects.toBeInstanceOf(PermissionError);
    expect(ctx.tx.chessSecurityEvent.create).not.toHaveBeenCalled();
  });
});
