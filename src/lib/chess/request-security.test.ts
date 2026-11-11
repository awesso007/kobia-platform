import {describe,it,expect} from "vitest";
import {assertMutationOrigin} from "./request-security";
describe("mutation protection",()=>{
 it("rejects missing origin and wrong content type",()=>{
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST"}))).toThrow();
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST",headers:{
   origin:"https://attacker.example", "content-type":"application/json"}}))).toThrow();
 });
 it("permits same-origin JSON mutations",()=>{
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST",headers:{
   origin:"https://example.com","content-type":"application/json"}}))).not.toThrow();
 });
});
