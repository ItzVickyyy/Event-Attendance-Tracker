import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { activateAttendanceSession, closeAttendanceSession, createAttendanceSession, getAttendanceSessions, type AttendanceSession, type AttendanceSessionType } from "@/data/attendanceSessions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

export const Route = createFileRoute("/_layout/events/$eventId/sessions")({ component: SessionsPage })

function SessionsPage() {
  const { eventId } = Route.useParams()
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [name, setName] = useState("")
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<AttendanceSessionType>("TIME_IN")
  const [lateCutoff, setLateCutoff] = useState("")
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    try { setSessions(await getAttendanceSessions(eventId)) }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load sessions") }
  }, [eventId])
  useEffect(() => { void reload() }, [reload])

  async function create() {
    if (!name.trim()) { toast.error("Session name is required"); return }
    setLoading(true)
    try {
      await createAttendanceSession({
        event_id: eventId,
        session_date: date,
        name: name.trim(),
        session_type: type,
        start_time: null,
        end_time: null,
        late_cutoff: lateCutoff || null,
        status: "SCHEDULED",
        display_order: sessions.length,
        is_active: false,
      })
      setName("")
      toast.success("Attendance session created")
      await reload()
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to create session") }
    finally { setLoading(false) }
  }

  async function activate(id: string) {
    try { await activateAttendanceSession(id); toast.success("Session is now active"); await reload() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to activate session") }
  }

  async function close(id: string) {
    try { await closeAttendanceSession(id); toast.success("Session closed"); await reload() }
    catch (error) { toast.error(error instanceof Error ? error.message : "Failed to close session") }
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <div><h1 className="text-2xl font-semibold">Attendance Sessions</h1><p className="text-sm text-muted-foreground">Scanners automatically use the active open session.</p></div>
    <Card><CardHeader><CardTitle>Create Session</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input value={name} onChange={e=>setName(e.target.value)} placeholder="Morning Time-In" />
      <Input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={type} onChange={e=>setType(e.target.value as AttendanceSessionType)}><option value="TIME_IN">Time-In</option><option value="TIME_OUT">Time-Out</option><option value="CUSTOM">Custom</option></select>
      <Input type="time" value={lateCutoff} onChange={e=>setLateCutoff(e.target.value)} />
      <Button className="sm:col-span-2 lg:col-span-4" onClick={create} disabled={loading}>Create Session</Button>
    </CardContent></Card>
    <div className="space-y-3">
      {sessions.map(session => <Card key={session.id}><CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{session.name}</span><Badge variant={session.is_active ? "default" : "outline"}>{session.is_active ? "ACTIVE" : session.status}</Badge><Badge variant="outline">{session.session_type}</Badge></div><p className="text-sm text-muted-foreground">{session.session_date}{session.late_cutoff ? ` · Late after ${session.late_cutoff}` : ""}</p></div>
        <div className="flex gap-2">{!session.is_active && session.status !== "CLOSED" && session.status !== "CANCELLED" && <Button size="sm" onClick={()=>void activate(session.id)}>Activate</Button>}{session.status === "OPEN" && <Button size="sm" variant="outline" onClick={()=>void close(session.id)}>Close</Button>}</div>
      </CardContent></Card>)}
      {sessions.length === 0 && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No attendance sessions yet.</CardContent></Card>}
    </div>
  </div>
}
