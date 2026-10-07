import { AuditLogsPanel } from "@/components/Developer/AuditLogsPanel"

export function AuditLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review authenticated API changes and their outcomes.
        </p>
      </div>
      <AuditLogsPanel />
    </div>
  )
}
