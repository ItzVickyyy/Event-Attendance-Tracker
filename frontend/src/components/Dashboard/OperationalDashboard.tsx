import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Activity, CalendarDays, RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { AttendanceService, EventsService, type EventPublic } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getPendingScans } from "@/data"
import { setupSyncStatusListener } from "@/data/sync"

function formatEventDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function SyncSummary() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const reload = () => void getPendingScans().then((scans) => setPendingCount(scans.length)).catch(() => setPendingCount(0))
    const onOnline = () => { setOnline(true); reload() }
    const onOffline = () => setOnline(false)
    const unsubscribe = setupSyncStatusListener({
      onSyncStart: () => setSyncing(true),
      onSyncEnd: () => { setSyncing(false); reload() },
    })
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    reload()
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
      unsubscribe()
    }
  }, [])

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="h-4 w-4" />Offline / Sync Status</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${online ? "bg-green-500" : "bg-amber-500"}`} /><span>{online ? "Online" : "Offline"}</span></div>
          <Badge variant={pendingCount > 0 ? "secondary" : "outline"}>{pendingCount} pending</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{syncing ? "Scanner synchronization is currently in progress." : pendingCount > 0 ? "Pending scans are managed from the Scanner workspace." : "No pending scans are currently queued."}</p>
        <Button asChild variant="outline" size="sm"><Link to="/scanner">Open Scanner</Link></Button>
      </CardContent>
    </Card>
  )
}

export function OperationalDashboard() {
  const eventsQuery = useQuery({
    queryKey: ["dashboard", "events"],
    queryFn: async () => (await EventsService.readEvents({ query: { skip: 0, limit: 100 } })).data,
  })
  const attendanceQuery = useQuery({
    queryKey: ["dashboard", "attendance"],
    queryFn: async () => (await AttendanceService.readAttendances({ query: { skip: 0, limit: 1 } })).data,
  })

  const events = eventsQuery.data?.data ?? []
  const recentEvents = [...events].sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()).slice(0, 5)

  return (
    <div className="flex flex-col gap-6">
      <div><h1 className="text-2xl font-bold tracking-tight">Dashboard</h1><p className="text-muted-foreground">Operational overview for events, attendance activity, and synchronization status.</p></div>

      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="mb-3 text-lg font-semibold">Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Events</CardTitle><CalendarDays className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{eventsQuery.isLoading ? "—" : eventsQuery.data?.count ?? 0}</div><p className="text-xs text-muted-foreground">Events available to your account</p></CardContent></Card>
          <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Attendance Records</CardTitle><Activity className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{attendanceQuery.isLoading ? "—" : attendanceQuery.data?.count ?? 0}</div><p className="text-xs text-muted-foreground">Records available from the attendance service</p></CardContent></Card>
        </div>
      </section>

      <section aria-labelledby="recent-events-heading">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 id="recent-events-heading" className="text-lg font-semibold">Recent Event Overview</h2><p className="text-sm text-muted-foreground">Recent events from the existing event service.</p></div><Button asChild variant="outline" size="sm"><Link to="/events">View Events</Link></Button></div>
        <Card><CardContent className="p-0">
          {eventsQuery.isError ? <div className="p-6 text-sm text-destructive">Unable to load recent events.</div> : !eventsQuery.isLoading && recentEvents.length === 0 ? <div className="p-8 text-center text-muted-foreground">No events are available yet.</div> : <div className="divide-y">
            {eventsQuery.isLoading ? <div className="p-6 text-sm text-muted-foreground">Loading recent events...</div> : recentEvents.map((event: EventPublic) => <Link key={event.id} to="/events/$eventId" params={{ eventId: event.id }} className="block p-4 transition-colors hover:bg-muted/50"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{event.event_name}</p><p className="text-sm text-muted-foreground">{formatEventDate(event.event_date)}</p></div><div className="flex items-center gap-2">{event.status && <Badge variant="outline">{event.status.replaceAll("_", " ")}</Badge>}{event.attendance_mode && <Badge variant="secondary">{event.attendance_mode === "time_in_only" ? "Time-In only" : "Time-In / Time-Out"}</Badge>}</div></div></Link>)}
          </div>}
        </CardContent></Card>
      </section>

      <SyncSummary />
    </div>
  )
}
