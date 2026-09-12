import { Users, Calendar, Clock, CheckCircle, AlertCircle, Download } from "lucide-react"
import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute, useRouterState } from "@tanstack/react-router"
import { format } from "date-fns"
import { Suspense } from "react"

import { AttendanceService, EventsService, StudentsService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PendingDashboard } from "@/components/Pending/PendingDashboard"

function getDashboardQueryOptions(eventId?: string) {
  return {
    queryFn: async () => {
      const [students, events, attendance] = await Promise.all([
        StudentsService.readStudents({ query: { skip: 0, limit: 1000 } }),
        EventsService.readEvents({ query: { skip: 0, limit: 100 } }),
        eventId
          ? AttendanceService.readAttendance({ query: { event_id: eventId, skip: 0, limit: 1000 } })
          : { data: { data: [], count: 0 } },
      ])
      return { students: students.data, events: events.data, attendance: attendance.data }
    },
    queryKey: ["dashboard", eventId],
  }
}

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - Event Attendance Tracker",
      },
    ],
  }),
})

function DashboardContent({ eventId }: { eventId?: string }) {
  const { data } = useSuspenseQuery(getDashboardQueryOptions(eventId))

  const totalStudents = data.students.count
  const registeredStudents = data.students.data.filter((s) => s.nfc_registered).length
  const events = data.events.data
  const attendance = data.attendance.data

  const currentEvent = eventId ? events.find((e) => e.id === eventId) : events[0]
  const eventAttendance = attendance

  const presentCount = eventAttendance.filter(
    (a) => a.status === "present" || a.status === "completed" || a.status === "time_in_only"
  ).length
  const absentCount = totalStudents - presentCount
  const attendanceRate = totalStudents > 0 ? ((presentCount / totalStudents) * 100).toFixed(1) : "0.0"

  const completedCount = eventAttendance.filter((a) => a.status === "completed").length
  const timeInOnlyCount = eventAttendance.filter((a) => a.status === "time_in_only").length
  const incompleteCount = eventAttendance.filter((a) => a.status === "incomplete").length

  const recentScans = eventAttendance
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {currentEvent
              ? `Overview for ${currentEvent.event_name} (${currentEvent.event_date})`
              : "No events created yet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">
              {registeredStudents} with NFC registered
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Present</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{presentCount}</div>
            <p className="text-xs text-muted-foreground">
              {attendanceRate}% attendance rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Absent</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{absentCount}</div>
            <p className="text-xs text-muted-foreground">Not yet checked in</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
<CardContent>
              <div className="text-2xl font-bold">{events.length}</div>
              <p className="text-xs text-muted-foreground">
                {events.filter((e) => e.status === "open").length} open
              </p>
            </CardContent>
        </Card>
      </div>

      {currentEvent && currentEvent.attendance_mode === "time_in_time_out" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Currently In</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{timeInOnlyCount}</div>
              <p className="text-xs text-muted-foreground">Timed in, not out</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <p className="text-xs text-muted-foreground">Timed in and out</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Incomplete</CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{incompleteCount}</div>
              <p className="text-xs text-muted-foreground">Timed in, missing time-out</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Scans</CardTitle>
        </CardHeader>
        <CardContent>
          {recentScans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No scans yet</p>
          ) : (
            <div className="space-y-2">
              {recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        scan.scan_method === "nfc"
                          ? "bg-blue-100 text-blue-600"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {scan.scan_method === "nfc" ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium">Student</p>
                      <p className="text-sm text-muted-foreground">
                        {scan.student_id} • {scan.scan_method.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={scan.status === "completed" ? "default" : "secondary"}>
                      {scan.status.replace("_", " ")}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-1">
                      {scan.time_in ? format(new Date(scan.time_in), "HH:mm:ss") : "-"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Dashboard() {
  const router = useRouterState()
  const eventId = router.location.search?.event_id as string | undefined

  return (
    <Suspense fallback={<PendingDashboard />}>
      <DashboardContent eventId={eventId} />
    </Suspense>
  )
}

export default Dashboard