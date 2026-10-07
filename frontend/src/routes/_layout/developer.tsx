import { useQuery } from "@tanstack/react-query"
import type { LucideIcon } from "lucide-react"
import { createFileRoute, redirect } from "@tanstack/react-router"
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Database,
  GraduationCap,
  RefreshCw,
  Server,
  Users,
} from "lucide-react"

import { UsersService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AuditLogsPanel } from "@/components/Developer/AuditLogsPanel"

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
  total_events: number
  total_students: number
  total_sections: number
  total_attendance_records: number
  total_attendance_sessions: number
  server_time_utc: string
}

export const Route = createFileRoute("/_layout/developer")({
  component: DeveloperDashboard,
  beforeLoad: async () => {
    const { data: user } = await UsersService.readUserMe()
    if (!user.is_developer && user.role !== "developer") {
      throw redirect({ to: "/dashboard" })
    }
  },
  head: () => ({
    meta: [{ title: "Developer System Dashboard - Event Attendance Tracker" }],
  }),
})

async function getDeveloperData<T>(path: string): Promise<T> {
  const token = localStorage.getItem("access_token")
  const baseUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")
  const response = await fetch(`${baseUrl}/api/v1/developer/${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail ?? "Unable to load developer diagnostics")
  }

  return (await response.json()) as T
}

function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  loading,
}: {
  title: string
  value: string | number
  description: string
  icon: LucideIcon
  loading: boolean
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight">{value}</div>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function DeveloperDashboard() {
  const healthQuery = useQuery({
    queryKey: ["developer", "health"],
    queryFn: () => getDeveloperData<SystemHealth>("health"),
    refetchInterval: 30_000,
  })
  const diagnosticsQuery = useQuery({
    queryKey: ["developer", "diagnostics"],
    queryFn: () => getDeveloperData<SystemDiagnostics>("diagnostics"),
  })

  const health = healthQuery.data
  const diagnostics = diagnosticsQuery.data
  const isLoading = healthQuery.isLoading || diagnosticsQuery.isLoading
  const error = healthQuery.error ?? diagnosticsQuery.error

  const refresh = async () => {
    await Promise.all([healthQuery.refetch(), diagnosticsQuery.refetch()])
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              System Workspace
            </p>
            <Badge variant="outline">Developer access</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Developer System Dashboard
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Read-only runtime health and system diagnostics. Business operations,
            user administration, and attendance management remain separate permissions.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={refresh}
          disabled={healthQuery.isFetching || diagnosticsQuery.isFetching}
          className="gap-2 self-start"
        >
          <RefreshCw
            className={`size-4 ${healthQuery.isFetching || diagnosticsQuery.isFetching ? "animate-spin" : ""}`}
          />
          Refresh diagnostics
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Diagnostics unavailable</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "A system request failed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" onClick={refresh}>
              Try again
            </Button>
          </CardContent>
        </Card>
      )}

      <section aria-label="System health" className="space-y-3">
        <h2 className="text-lg font-semibold">System health</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API status</CardTitle>
              <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`size-5 ${health?.status === "healthy" ? "text-emerald-600" : "text-destructive"}`}
                    aria-hidden="true"
                  />
                  <span className="text-2xl font-semibold capitalize">
                    {health?.status ?? "Unknown"}
                  </span>
                </div>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Environment: {health?.environment ?? "Unavailable"}
              </p>
            </CardContent>
          </Card>
          <MetricCard
            title="Database latency"
            value={health ? `${health.database_latency_ms} ms` : "Unavailable"}
            description={`Connection: ${health?.database_status ?? "Unknown"}`}
            icon={Database}
            loading={isLoading}
          />
          <MetricCard
            title="FastAPI"
            value={health ? `v${health.fastapi_version}` : "Unavailable"}
            description={health ? `Python ${health.python_version}` : "Runtime version"}
            icon={Server}
            loading={isLoading}
          />
          <MetricCard
            title="Database engine"
            value={diagnostics?.database_engine ?? "Unavailable"}
            description={health?.platform_system ?? "Server platform"}
            icon={Database}
            loading={isLoading}
          />
        </div>
      </section>

      <section aria-label="System diagnostics" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">System diagnostics</h2>
          <p className="text-sm text-muted-foreground">
            Aggregate counts only. This page does not expose individual user, student, or attendance records.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard title="User accounts" value={diagnostics?.total_users ?? 0} description="All registered accounts" icon={Users} loading={isLoading} />
          <MetricCard title="Events" value={diagnostics?.total_events ?? 0} description="Events stored in the system" icon={CalendarDays} loading={isLoading} />
          <MetricCard title="Students" value={diagnostics?.total_students ?? 0} description="Student records" icon={GraduationCap} loading={isLoading} />
          <MetricCard title="Sections" value={diagnostics?.total_sections ?? 0} description="Academic sections" icon={Users} loading={isLoading} />
          <MetricCard title="Attendance records" value={diagnostics?.total_attendance_records ?? 0} description="Stored attendance entries" icon={CheckCircle2} loading={isLoading} />
          <MetricCard title="Attendance sessions" value={diagnostics?.total_attendance_sessions ?? 0} description="Configured event sessions" icon={CalendarDays} loading={isLoading} />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Developer access boundary</CardTitle>
          <CardDescription>
            This workspace is for technical oversight, not day-to-day attendance administration.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          System logs, controlled feature flags, maintenance mode, and deeper diagnostics can be added after their backend audit trail and runtime enforcement are implemented. This dashboard intentionally does not display fabricated logs or offer controls that are not enforced by the backend.
        </CardContent>
      </Card>
    </div>
  )
}
