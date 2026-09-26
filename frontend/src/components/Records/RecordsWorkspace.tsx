import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Download, History, Loader2, AlertCircle, ClipboardList } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AttendanceService, EventsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import { attendanceColumns } from "@/components/Attendance/recordsColumns"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function RecordsWorkspace({ mode = "records" }: { mode?: "records" | "history" | "incomplete" | "export" }) {
  const [eventId, setEventId] = useState<string>("all")
  const eventsQuery = useQuery({ queryKey: ["records-events"], queryFn: () => EventsService.readEvents({ query: { skip: 0, limit: 1000 } }) })
  const attendanceQuery = useQuery({ queryKey: ["records-attendance", eventId], queryFn: () => AttendanceService.readAttendances({ query: { event_id: eventId === "all" ? undefined : eventId, skip: 0, limit: 1000 } }) })
  const events = eventsQuery.data?.data ?? []
  const allAttendance = attendanceQuery.data?.data ?? []
  const attendance = mode === "incomplete" ? allAttendance.filter((record) => record.status === "incomplete" || (record.time_in && !record.time_out)) : allAttendance
  const selectedEvent = events.find((event) => event.id === eventId)

  async function exportAttendance() {
    try {
      const token = localStorage.getItem("access_token")
      const params = new URLSearchParams()
      if (eventId !== "all") params.set("event_id", eventId)
      const response = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/v1/attendance/export${params.toString() ? `?${params}` : ""}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!response.ok) throw new Error("Failed to export attendance")
      const blob = await response.blob()
      if (!blob.size) { toast.info("No attendance data to export"); return }
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `attendance_${selectedEvent?.event_name?.replace(/\s+/g, "_").toLowerCase() || "all"}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success("Attendance exported successfully")
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to export attendance") }
  }

  const title = mode === "history" ? "Attendance History" : mode === "incomplete" ? "Incomplete Attendance" : mode === "export" ? "Export / Print" : "Attendance Records"
  const description = mode === "incomplete" ? "Records where a student tapped in but has no recorded time-out." : mode === "history" ? "Historical attendance records with event and attendance context." : mode === "export" ? "Export attendance records using the project's supported CSV export." : "Operational attendance records from the existing attendance API."

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={eventId} onValueChange={setEventId}><SelectTrigger className="w-[240px]"><SelectValue placeholder="All events" /></SelectTrigger><SelectContent><SelectItem value="all">All events</SelectItem>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.event_name}</SelectItem>)}</SelectContent></Select>
        <Button variant="outline" asChild><Link to="/records/history"><History />History</Link></Button>
        <Button variant="outline" asChild><Link to="/records/incomplete"><AlertCircle />Incomplete</Link></Button>
        <Button onClick={exportAttendance} disabled={attendanceQuery.isLoading}><Download />Export</Button>
      </div>
    </div>
    {eventsQuery.isError || attendanceQuery.isError ? <Card><CardContent className="py-10 text-center"><p className="font-medium">Unable to load attendance records.</p><p className="mt-1 text-sm text-muted-foreground">The existing attendance API returned an error.</p></CardContent></Card> : attendanceQuery.isLoading ? <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="animate-spin" />Loading attendance records…</CardContent></Card> : attendance.length === 0 ? <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center"><ClipboardList className="mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">No attendance records</p><p className="mt-1 text-sm text-muted-foreground">There are no records matching the selected view.</p></CardContent></Card> : <DataTable columns={attendanceColumns} data={attendance} />}
  </div>
}
