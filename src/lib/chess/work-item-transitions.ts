/** Explicit task lifecycle. Terminal tasks cannot be silently reopened. */
export type WorkStatus="TODO"|"IN_PROGRESS"|"BLOCKED"|"COMPLETED"|"CANCELLED";
const allowed:Record<WorkStatus,readonly WorkStatus[]>={
 TODO:["IN_PROGRESS","BLOCKED","CANCELLED"],
 IN_PROGRESS:["BLOCKED","COMPLETED","CANCELLED"],
 BLOCKED:["IN_PROGRESS","CANCELLED"],
 COMPLETED:[],
 CANCELLED:[],
};
export function isAllowedWorkTransition(from:WorkStatus,to:WorkStatus):boolean {
 return allowed[from]?.includes(to)??false;
}
