/**
 * Live parent-child selectors for historical nested mutation endpoints.
 * The child ID and parent ID must both match in the SAME tenant Prisma schema.
 * Never trust a parent URL that is not part of the downstream WHERE.
 */
import type { PrismaClient } from "@/lib/db/generated/tenant";
type Db = Pick<PrismaClient, "formV2" | "formStep" | "formField" | "sitePage" | "siteBlock" | "workflowRun">;

export async function formExists(db: Pick<Db,"formV2">, formId: string): Promise<boolean> {
  return !!formId && !!(await db.formV2.findFirst({
    where: { id: formId }, select: { id: true },
  }));
}
export async function formStepBelongsToForm(db: Pick<Db,"formStep">, formId: string, stepId: string): Promise<boolean> {
  return !!formId && !!stepId && !!(await db.formStep.findFirst({
    where: { id: stepId, formId }, select: { id: true },
  }));
}
export async function formFieldBelongsToForm(db: Pick<Db,"formField">, formId: string, fieldId: string): Promise<boolean> {
  return !!formId && !!fieldId && !!(await db.formField.findFirst({
    where: { id: fieldId, formId }, select: { id: true },
  }));
}
export async function scopedFormFieldsMatch(db: Pick<Db,"formField">, formId: string, ids: string[]): Promise<boolean> {
  if (!formId || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id=>!id)) return false;
  if (!ids.length) return true;
  const matched = await db.formField.count({ where: { formId, id: { in: ids } } });
  return matched === ids.length;
}
export async function scopedFormStepsMatch(db: Pick<Db,"formStep">, formId: string, ids: string[]): Promise<boolean> {
  if (!formId || ids.length > 200 || new Set(ids).size !== ids.length || ids.some(id=>!id)) return false;
  if (!ids.length) return true;
  const matched = await db.formStep.count({ where: { formId, id: { in: ids } } });
  return matched === ids.length;
}
export async function sitePageBelongsToSite(db: Pick<Db,"sitePage">, siteId: string, pageId: string): Promise<boolean> {
  return !!siteId && !!pageId && !!(await db.sitePage.findFirst({
    where: { id: pageId, siteId }, select: { id: true },
  }));
}
export async function siteBlockBelongsToPage(db: Pick<Db,"siteBlock">, pageId: string, blockId: string): Promise<boolean> {
  return !!pageId && !!blockId && !!(await db.siteBlock.findFirst({
    where: { id: blockId, pageId }, select: { id: true },
  }));
}
export async function scopedSiteBlocksMatch(db: Pick<Db,"siteBlock">, pageId: string, ids: string[]): Promise<boolean> {
  if (!pageId || ids.length > 300 || new Set(ids).size !== ids.length || ids.some(id=>!id)) return false;
  if (!ids.length) return true;
  return (await db.siteBlock.count({ where: { pageId, id: { in: ids } } })) === ids.length;
}
export async function workflowRunBelongsToWorkflow(db: Pick<Db,"workflowRun">, workflowId: string, runId: string): Promise<boolean> {
  return !!workflowId && !!runId && !!(await db.workflowRun.findFirst({
    where: { id: runId, workflowId }, select: { id: true },
  }));
}
