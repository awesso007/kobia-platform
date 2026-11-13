/** UI visibility only; server payroll execution still independently verifies
 * exact signed approval, actor roles, client consent, mapped run and vendor. */
export function payrollExecutionUiEnabled(input:{
 admin:boolean;certified:boolean;providerConfigured:boolean;demoMode:boolean;
}):boolean{
 return input.admin&&input.certified&&input.providerConfigured&&!input.demoMode;
}
