export function ModuleShell({
  tenantSlug,
  module,
  cycle,
}: {
  tenantSlug: string;
  module: string;
  cycle: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-wider text-muted-foreground">{tenantSlug}</p>
        <h1 className="text-3xl font-bold">{module}</h1>
      </div>
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center">
        <p className="text-sm text-muted-foreground">Coming in {cycle}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          This module is scaffolded but not yet built. Track progress in the weekly velocity log.
        </p>
      </div>
    </div>
  );
}
