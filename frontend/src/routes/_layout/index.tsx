import { Activity, CalendarDays, ScanLine } from "lucide-react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { PlaceholderPage } from "@/components/Reconstruction/PlaceholderPage"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Event Attendance Tracker" }] }),
})

function Dashboard() {
  return (
    <PlaceholderPage
      title="Dashboard"
      description="A focused operational overview for events, attendance activity, and synchronization status."
      detail="Phase 1 establishes the composition only. Production metrics will be restored as the dashboard reconstruction is implemented."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4" />Recent event</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Reserved for the recent event overview.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="size-4" />Overview</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Reserved for verified attendance summaries.</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="size-4" />Offline / sync</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Reserved for the read-only sync queue summary.</p></CardContent>
        </Card>
      </div>
      <div className="pt-2 text-sm text-muted-foreground">
        <Link className="underline underline-offset-4" to="/scanner">Open Scanner</Link>
      </div>
    </PlaceholderPage>
  )
}

export default Dashboard
