import { AuditLogsPanel } from "@/components/Developer/AuditLogsPanel"

export function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Review administrative activity, account and permission changes, and
          API outcomes for accountability. Technical health and runtime
          diagnostics remain in the Developer workspace.
        </p>
      </div>
      <AuditLogsPanel />
    </div>
  )
}
