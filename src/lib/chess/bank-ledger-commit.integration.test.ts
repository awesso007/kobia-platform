import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {PrismaClient} from "@prisma/client";
import {commitLegacyBankClassification} from "./bank-ledger-commit";
import {reconcileLegacyChessPosting} from "./bank-ledger-reconcile";
const integration=process.env.RUN_CHESS_LEGACY_DB_INTEGRATION==="1"?describe:describe.skip;

integration("legacy ledger atomic CHESS classification in isolated PostgreSQL",()=>{
 let db:PrismaClient;
 beforeAll(async()=>{db=new PrismaClient();await db.$connect();});
 afterAll(async()=>{if(db)await db.$disconnect();});
 it("posts two balanced lines once, updates cached balances and rejects a replay",async()=>{
  const slug="chess-bank-ci-"+Date.now().toString(36);
  const tenant=await db.tenant.create({data:{slug,name:"Fictional CI tenant"}});
  const entity=await db.entity.create({data:{
   tenantId:tenant.id,name:"Fictional CI LLC",baseCurrency:"USD",
  }});
  const bankGl=await db.account.create({data:{
   tenantId:tenant.id,entityId:entity.id,code:"1010",name:"Checking",type:"ASSET",
  }});
  const incomeGl=await db.account.create({data:{
   tenantId:tenant.id,entityId:entity.id,code:"4010",name:"Services",type:"REVENUE",
  }});
  const account=await db.bankAccount.create({data:{
   tenantId:tenant.id,entityId:entity.id,glAccountId:bankGl.id,
   name:"Fictional checking",accountType:"CHECKING",currency:"USD",
  }});
  const txn=await db.bankTransaction.create({data:{
   tenantId:tenant.id,bankAccountId:account.id,
   postedDate:new Date("2026-10-15T00:00:00Z"),
   amountCents:12055n,description:"FICTIONAL demo bank deposit",
   dedupHash:"fictional-bank-ci-"+slug,status:"UNMATCHED",
  }});
  const draft={
   tenantId:tenant.id,entityId:entity.id,bankTransactionId:txn.id,
   bankAccountId:account.id,dedupHash:txn.dedupHash,
   postedDate:txn.postedDate,amountCents:txn.amountCents,
   bankGlAccountId:bankGl.id,offsetAccountId:incomeGl.id,
   sourceRefId:"chess-bank-review:fictional-"+slug,
   actorId:"independent-clerk-ci",
  };
  const competing=await Promise.allSettled([
   commitLegacyBankClassification(db,draft),
   commitLegacyBankClassification(db,draft),
  ]);
  const won=competing.filter((r):r is PromiseFulfilledResult<string>=>r.status==="fulfilled");
  expect(won).toHaveLength(1);
  expect(competing.filter(r=>r.status==="rejected")).toHaveLength(1);
  const jeId=won[0]!.value;
  const reconciled=await reconcileLegacyChessPosting(db,{
   tenantId:tenant.id,entityId:entity.id,bankTransactionId:txn.id,
   sourceRefId:draft.sourceRefId,
  });
  expect(reconciled).toEqual({
   status:"MATCHED_POSTED",journalEntryId:jeId,
   bankSettled:false,requiresIndependentReview:false,
  });
  expect(await reconcileLegacyChessPosting(db,{
   tenantId:tenant.id,entityId:entity.id,bankTransactionId:txn.id,
   sourceRefId:"chess-bank-review:unrelated",
  })).toMatchObject({status:"DIVERGED",
   journalEntryId:null,requiresIndependentReview:true});
  const [posted,after,cash,income]=await Promise.all([
   db.journalEntry.findUnique({where:{id:jeId},include:{lines:true}}),
   db.bankTransaction.findUnique({where:{id:txn.id}}),
   db.account.findUnique({where:{id:bankGl.id}}),
   db.account.findUnique({where:{id:incomeGl.id}}),
  ]);
  expect(posted?.status).toBe("POSTED");
  expect(posted?.lines).toHaveLength(2);
  expect(posted?.lines.reduce((n,line)=>n+line.debitCents,0n)).toBe(12055n);
  expect(posted?.lines.reduce((n,line)=>n+line.creditCents,0n)).toBe(12055n);
  expect(after?.status).toBe("CATEGORIZED");
  expect(after?.categorizedJournalEntryId).toBe(jeId);
  expect(cash?.balanceCents).toBe(12055n);
  expect(income?.balanceCents).toBe(12055n);
  await expect(commitLegacyBankClassification(db,draft)).rejects.toThrow();
  expect(await db.journalEntry.count({where:{
   tenantId:tenant.id,entityId:entity.id,sourceRefId:draft.sourceRefId,
  }})).toBe(1);
 });
 it("rolls back bank classification when the accounting period is CLOSED",async()=>{
  const tenant=await db.tenant.create({data:{
   slug:"chess-closed-ci-"+Date.now().toString(36),name:"Fictional closed period",
  }});
  const entity=await db.entity.create({data:{tenantId:tenant.id,name:"Period test"}});
  const bankGl=await db.account.create({data:{
   tenantId:tenant.id,entityId:entity.id,code:"1010",name:"Checking",type:"ASSET",
  }});
  const offset=await db.account.create({data:{
   tenantId:tenant.id,entityId:entity.id,code:"6010",name:"Supplies",type:"EXPENSE",
  }});
  const bank=await db.bankAccount.create({data:{
   tenantId:tenant.id,entityId:entity.id,glAccountId:bankGl.id,name:"Checking",
  }});
  const postedDate=new Date("2026-10-16T00:00:00Z");
  await db.accountingPeriod.create({data:{
   tenantId:tenant.id,entityId:entity.id,
   startDate:new Date("2026-10-01T00:00:00Z"),
   endDate:new Date("2026-10-31T00:00:00Z"),label:"October 2026",status:"CLOSED",
  }});
  const txn=await db.bankTransaction.create({data:{
   tenantId:tenant.id,bankAccountId:bank.id,postedDate,
   description:"Fictional debit",dedupHash:"closed-"+tenant.id,amountCents:-2500n,
  }});
  expect(await reconcileLegacyChessPosting(db,{
   tenantId:tenant.id,entityId:entity.id,bankTransactionId:txn.id,
   sourceRefId:"chess-bank-review:closed-"+tenant.id,
  })).toMatchObject({status:"UNPOSTED",bankSettled:false});
  await expect(commitLegacyBankClassification(db,{
   tenantId:tenant.id,entityId:entity.id,
   bankTransactionId:txn.id,bankAccountId:bank.id,
   dedupHash:txn.dedupHash,postedDate,amountCents:-2500n,
   bankGlAccountId:bankGl.id,offsetAccountId:offset.id,
   sourceRefId:"chess-bank-review:closed-"+tenant.id,actorId:"separate-clerk-ci",
  })).rejects.toThrow();
  expect((await db.bankTransaction.findUnique({where:{id:txn.id}}))?.status)
   .toBe("UNMATCHED");
  expect(await db.journalEntry.count({where:{tenantId:tenant.id,entityId:entity.id}}))
   .toBe(0);
  expect((await db.account.findUnique({where:{id:bankGl.id}}))?.balanceCents).toBe(0n);
 });
});
