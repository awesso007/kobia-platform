import {afterEach,describe,expect,it,vi} from "vitest";
import {aiTriageConfigured,dueBucket,validateTriageOutput,
 requestChessAiTriage,workItemSourceDigest} from "./ai-triage-provider";
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("M7 supervised AI triage security",()=>{
 const features={status:"TODO" as const,dueBucket:"OVERDUE" as const,
  hasAssignee:true};
 it("never accepts closed-work escalation or low-priority overdue work",()=>{
  const example={priority:"NORMAL",recommendation:"REVIEW_DEADLINE",
   rationaleCode:"DEADLINE_OVERDUE",modelVersion:"version_1"};
  expect(validateTriageOutput(example,features).priority).toBe("NORMAL");
  expect(()=>validateTriageOutput({...example,priority:"LOW"},features)).toThrow();
  expect(()=>validateTriageOutput({...example,arbitraryInstruction:"POST_PAYROLL"},features)).toThrow();
  expect(()=>validateTriageOutput({...example,priority:"HIGH"},{
   status:"COMPLETED",dueBucket:"UNSCHEDULED",hasAssignee:false,
  })).toThrow();
  expect(()=>validateTriageOutput({...example,recommendation:"KEEP_QUEUE"},{
   status:"BLOCKED",dueBucket:"LATER",hasAssignee:true,
  })).toThrow();
 });
 it("binds a suggestion to the exact source state",()=>{
  const initial={tenantId:"tenant",businessId:"business",id:"task",
   status:"TODO",updatedAt:new Date("2026-11-11T01:00:00.000Z"),
   dueAt:new Date("2026-11-12T01:00:00.000Z"),
   assignedClerkUserId:"staff"};
  const hash=workItemSourceDigest(initial);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(hash).not.toBe(workItemSourceDigest({...initial,status:"BLOCKED"}));
  expect(hash).not.toBe(workItemSourceDigest({...initial,tenantId:"other"}));
  expect(dueBucket(initial.dueAt,new Date("2026-11-11T00:00:00Z")))
   .toBe("WITHIN_48_HOURS");
 });
 it("requires explicit provider activation, exact HTTPS origin and sends no text or client identifiers",async()=>{
  vi.stubEnv("CHESS_AI_TRIAGE_ENABLED","true");
  vi.stubEnv("CHESS_AI_TRIAGE_API_URL","https://ai.example.test/triage");
  vi.stubEnv("CHESS_AI_ALLOWED_HOST","ai.example.test");
  vi.stubEnv("CHESS_AI_API_KEY","sandbox");
  expect(aiTriageConfigured()).toBe(true);
  const http=vi.fn().mockResolvedValue({ok:true,json:async()=>({
   priority:"HIGH",recommendation:"ESCALATE_TO_MANAGER",
   rationaleCode:"DEADLINE_OVERDUE",modelVersion:"model_v1",
  })});
  vi.stubGlobal("fetch",http);
  expect((await requestChessAiTriage(features)).priority).toBe("HIGH");
  const [url,options]=http.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe("https://ai.example.test/triage");
  expect(JSON.parse(String(options.body))).toEqual({
   purpose:"WORK_ITEM_TRIAGE_V1",features,
  });
  expect(String(options.body)).not.toContain("clientProfileId");
  expect(String(options.body)).not.toContain("title");
  vi.stubEnv("CHESS_AI_TRIAGE_API_URL","https://evil.invalid/triage");
  expect(aiTriageConfigured()).toBe(false);
 });
});
