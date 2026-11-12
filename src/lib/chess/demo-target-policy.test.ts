import {describe,expect,it} from "vitest";
import {assertChessDemoInventorySafe,type DemoInventory} from "./demo-target-policy";
const clean: DemoInventory = {publicTables:[],tenantSchemas:[],registrations:[]};
describe("CHESS Codespaces pre-migration database isolation",()=>{
 it("accepts fresh DB and exact existing demo",()=>{
  expect(()=>assertChessDemoInventorySafe(clean)).not.toThrow();
  expect(()=>assertChessDemoInventorySafe({
   publicTables:["tenant_registry","billing_event","_prisma_migrations"],
   tenantSchemas:["tenant_chess_demo"],
   registrations:[{slug:"chess-demo",schemaName:"tenant_chess_demo",
    plan:"DEMO",status:"ACTIVE"}],
  })).not.toThrow();
 });
 it("refuses other tables and other tenant schemas before migration",()=>{
  expect(()=>assertChessDemoInventorySafe({...clean,publicTables:["Tenant"]})).toThrow();
  expect(()=>assertChessDemoInventorySafe({...clean,publicTables:["Customer"]})).toThrow();
  expect(()=>assertChessDemoInventorySafe({...clean,
   tenantSchemas:["tenant_chess_demo","tenant_fig"]})).toThrow();
  expect(()=>assertChessDemoInventorySafe({...clean,
   tenantSchemas:["unrelated_customer_data"]})).toThrow();
  expect(()=>assertChessDemoInventorySafe({...clean,
   registrations:[{slug:"fig",schemaName:"tenant_fig",
    plan:"FREE",status:"ACTIVE"}]})).toThrow();
 });
 it("refuses inactive, remapped and non-demo records",()=>{
  for(const changed of [
   {plan:"FREE"}, {status:"SUSPENDED"}, {schemaName:"tenant_elsewhere"}, {slug:"other"},
  ]){
   expect(()=>assertChessDemoInventorySafe({...clean,
    registrations:[{slug:"chess-demo",schemaName:"tenant_chess_demo",
     plan:"DEMO",status:"ACTIVE",...changed}]})).toThrow();
  }
 });
});
