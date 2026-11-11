import {describe,it,expect,vi,afterEach} from "vitest";
afterEach(()=>vi.unstubAllEnvs());
import {assertMutationOrigin} from "./request-security";
describe("mutation protection",()=>{
 it("rejects missing origin and wrong content type",()=>{
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST"}))).toThrow();
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST",headers:{
   origin:"https://attacker.example", "content-type":"application/json"}}))).toThrow();
 });
 it("requires a configured trusted origin in production",()=>{
  vi.stubEnv("NODE_ENV","production");
  vi.stubEnv("CHESS_PUBLIC_ORIGIN","");
  const request=new Request("https://example.com/api",{
   method:"POST",headers:{"Origin":"https://example.com",
    "Content-Type":"application/json"},
  });
  expect(()=>assertMutationOrigin(request)).toThrow();
  vi.stubEnv("CHESS_PUBLIC_ORIGIN","https://example.com");
  expect(()=>assertMutationOrigin(request)).not.toThrow();
 });
 it("rejects disguised content types and cross-site fetch metadata",()=>{
  for(const type of ["application/jsonp","application/json-not-json","text/plain"]){
   expect(()=>assertMutationOrigin(new Request("https://example.com/api",{
    method:"POST",headers:{Origin:"https://example.com","Content-Type":type},
   }))).toThrow();
  }
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{
   method:"POST",headers:{Origin:"https://example.com",
    "Content-Type":"application/json","Sec-Fetch-Site":"cross-site"},
  }))).toThrow();
 });
 it("permits same-origin JSON mutations",()=>{
  expect(()=>assertMutationOrigin(new Request("https://example.com/api",{method:"POST",headers:{
   origin:"https://example.com","content-type":"application/json"}}))).not.toThrow();
 });
});
