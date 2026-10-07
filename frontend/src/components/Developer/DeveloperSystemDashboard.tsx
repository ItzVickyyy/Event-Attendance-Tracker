import { useQuery } from "@tanstack/react-query"
import { Activity, CalendarDays, ClipboardCheck, Database, RefreshCw, Server, Users, UserRound, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type SystemHealth = {
  status: string
  database_status: string
  database_latency_ms: number
  server_time_utc: string
  environment: string
  python_version: string
  fastapi_version: string
  platform_system: string
}

type SystemDiagnostics = {
  database_engine: string
  total_users: number
  total_students: number
  total_events: number
  total_attendance_records: number
  total_attendance_sessions: number
  total_attendance_corrections: number
  total_import_batches: number
  server_time_utc: string
}

async function developerRequest<T>(endpoint: string): Promise<T> {
  const token = localStorage.getItem("access_token")
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/developer/${endpoint}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? "Unable to load developer diagnostics")
  }
  return response.json() as Promise<T>
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return <Card><CardContent className="flex items-center justify-between gap-4 p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p></div><div className="rounded-xl border bg-muted/40 p-3"><Icon aria-hidden="true" className="size-5 text-muted-foreground" /></div></CardContent></Card>
}

export function DeveloperSystemDashboard() {
  const health = useQuery({ queryKey: ["developer-health"], queryFn: () => developerRequest<SystemHealth>("health"), refetchInterval: 30000 })
  const diagnostics = useQuery({ queryKey: ["developer-diagnostics"], queryFn: () => developerRequest<SystemDiagnostics>("diagnostics") })
  const refresh = async () => {
    await Promise.all([health.refetch(), diagnostics.refetch()])
  }

  return <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Workspace / Developer</p>
        <div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold tracking-tight">Developer System Dashboard</h1><span className="rounded-full border px-3 py-1 text-xs font-medium">System Level</span></div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Technical diagnostics and application-wide metrics. Developer access is separate from administrative permissions.</p>
      </div>
      <Button variant="outline" onClick={refresh} disabled={health.isFetching || diagnostics.isFetching}><RefreshCw className={`mr-2 size-4 ${health.isFetching || diagnostics.isFetching ? "animate-spin" : ""}`} />Refresh diagnostics</Button>
    </header>

    <section aria-label="System health" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">System status</CardTitle><Activity className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold capitalize">{health.isLoading ? "Loading…" : health.data?.status ?? "Unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">{health.data ? `Environment: ${health.data.environment}` : health.isError ? "Unable to reach diagnostics endpoint." : "Checking application health"}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Database</CardTitle><Database className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold capitalize">{health.isLoading ? "Loading…" : health.data?.database_status ?? "Unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">{health.data ? `${health.data.database_latency_ms} ms response time` : "Connection status"}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Runtime</CardTitle><Server className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-lg font-semibold">{health.data?.python_version ?? (health.isLoading ? "Loading…" : "Unavailable")}</p><p className="mt-1 text-xs text-muted-foreground">{health.data ? `Python · FastAPI ${health.data.fastapi_version}` : "Runtime version"}</p></CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Database engine</CardTitle><Database className="size-4 text-muted-foreground" /></CardHeader><CardContent><p className="text-2xl font-semibold uppercase">{diagnostics.data?.database_engine ?? (diagnostics.isLoading ? "Loading…" : "Unavailable")}</p><p className="mt-1 text-xs text-muted-foreground">Active database dialect</p></CardContent></Card>
    </section>

    <section className="space-y-4">
      <div><h2 className="text-xl font-semibold tracking-tight">Application diagnostics</h2><p className="mt-1 text-sm text-muted-foreground">Aggregate counts only. This dashboard does not expose student or attendance details.</p></div>
      {diagnostics.isError && <Card><CardContent className="py-5 text-sm text-destructive">Unable to load application metrics. Refresh or check the backend logs.</CardContent></Card>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {diagnostics.data && <>
          <Metric label="User accounts" value={diagnostics.data.total_users} icon={Users} />
          <Metric label="Students" value={diagnostics.data.total_students} icon={UserRound} />
          <Metric label="Events" value={diagnostics.data.total_events} icon={CalendarDays} />
          <Metric label="Attendance records" value={diagnostics.data.total_attendance_records} icon={ClipboardCheck} />
          <Metric label="Attendance sessions" value={diagnostics.data.total_attendance_sessions} icon={Activity} />
          <Metric label="Attendance corrections" value={diagnostics.data.total_attendance_corrections} icon={ClipboardCheck} />
          <Metric label="Import batches" value={diagnostics.data.total_import_batches} icon={FileSpreadsheet} />
        </>}
        {diagnostics.isLoading && <Card><CardContent className="py-8 text-sm text-muted-foreground">Loading application metrics…</CardContent></Card>}
      </div>
    </section>

    {health.data && <p className="text-xs text-muted-foreground">Last health check: {new Date(health.data.server_time_utc).toLocaleString()}</p>}
  </div>
}
