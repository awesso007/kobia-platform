import { describe, expect, it, vi } from "vitest";
import {
  formFieldBelongsToForm, formStepBelongsToForm, scopedFormFieldsMatch,
  scopedFormStepsMatch, sitePageBelongsToSite, siteBlockBelongsToPage,
  scopedSiteBlocksMatch, workflowRunBelongsToWorkflow,
} from "./historical-resource-scope";

describe("Round 49 path parent-child security", () => {
  it("enforces both parent and child IDs in the lookup predicate", async () => {
    const formField = { findFirst: vi.fn(async ({where}:{where:{id:string;formId:string}})=>
      where.id === "field-a" && where.formId === "form-a" ? {id:"field-a"} : null) };
    expect(await formFieldBelongsToForm({formField} as never,"form-a","field-a")).toBe(true);
    expect(await formFieldBelongsToForm({formField} as never,"form-b","field-a")).toBe(false);
    expect(formField.findFirst).toHaveBeenCalledWith({where:{id:"field-a",formId:"form-b"},select:{id:true}});
    const step = { findFirst: vi.fn(async ({where}:{where:{id:string;formId:string}})=>
      where.formId==="form-a"?{id:"step-a"}:null) };
    expect(await formStepBelongsToForm({formStep:step} as never,"form-b","step-a")).toBe(false);
  });
  it("requires all requested reorders to belong to one parent without duplicates", async () => {
    const formField = { count: vi.fn(async ({where}:{where:{formId:string;id:{in:string[]}}})=>
      where.formId==="form-a" ? where.id.in.filter(x=>x==="field-a").length : 0) };
    expect(await scopedFormFieldsMatch({formField} as never,"form-a",["field-a"])).toBe(true);
    expect(await scopedFormFieldsMatch({formField} as never,"form-a",["field-a","foreign"])).toBe(false);
    expect(await scopedFormFieldsMatch({formField} as never,"form-a",["field-a","field-a"])).toBe(false);
    const formStep={count:vi.fn(async()=>1)};
    expect(await scopedFormStepsMatch({formStep} as never,"form-a",["step-a","foreign"])).toBe(false);
  });
  it("requires nested site, block and workflow run ancestry, not mere tenant membership", async () => {
    const sitePage={findFirst:vi.fn(async ({where}:{where:{siteId:string}})=>
      where.siteId==="site-a"?{id:"page-a"}:null)};
    const siteBlock={findFirst:vi.fn(async ({where}:{where:{pageId:string}})=>
      where.pageId==="page-a"?{id:"block-a"}:null),count:vi.fn(async()=>0)};
    const workflowRun={findFirst:vi.fn(async ({where}:{where:{workflowId:string}})=>
      where.workflowId==="workflow-a"?{id:"run-a"}:null)};
    expect(await sitePageBelongsToSite({sitePage} as never,"site-b","page-a")).toBe(false);
    expect(await siteBlockBelongsToPage({siteBlock} as never,"page-b","block-a")).toBe(false);
    expect(await scopedSiteBlocksMatch({siteBlock} as never,"page-a",["foreign"])).toBe(false);
    expect(await workflowRunBelongsToWorkflow({workflowRun} as never,"workflow-b","run-a")).toBe(false);
  });
});
