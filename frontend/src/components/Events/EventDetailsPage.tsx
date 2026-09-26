import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Calendar, Clock, MapPin, ScanLine } from "lucide-react"
import { EventsService } from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EventDetailsPage({ eventId }: { eventId: string }) {
  const query = useQuery({ queryKey: ["event", eventId], queryFn: () => EventsService.readEvent({ path: { event_id: eventId } }) })
  const event = query.data?.data
  if (query.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading event…</CardContent></Card>
  if (query.isError || !event) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Event not found.</p><p className="mt-1 text-sm text-muted-foreground">The requested event could not be loaded.</p><Button className="mt-4" variant="outline" asChild><Link to="/events"><ArrowLeft />Back to events</Link></Button></CardContent></Card>
  const mode = event.attendance_mode === "time_in_time_out" ? "Time-In + Time-Out" : "Time-In Only"
  const status = event.status || "draft"
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Button variant="ghost" size="sm" asChild><Link to="/events"><ArrowLeft />Events</Link></Button><div className="mt-4"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-tight">{event.event_name}</h1><Badge variant="outline">{status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Event workspace</p></div></div><Button asChild><Link to="/scanner" search={{ event_id: event.id }}><ScanLine />Open Scanner</Link></Button></div>
    <Card><CardHeader><CardTitle className="text-base">Event Information</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><Info icon={<Calendar />} label="Date" value={event.event_date} /><Info icon={<Clock />} label="Start" value={event.start_time || "—"} /><Info icon={<Clock />} label="End" value={event.end_time || "—"} /><Info icon={<MapPin />} label="Location" value={event.location || "—"} /><Info label="Attendance mode" value={mode} /><Info label="Status" value={status} /></CardContent></Card>
    <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="text-base">Registration</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Configure event eligibility and registration in the event registration workspace.</p><Button className="mt-4" variant="outline" asChild><Link to="/events/$eventId/registration" params={{ eventId }}>Open Registration</Link></Button></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Roster</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">View the event’s live attendance population and roster state.</p><Button className="mt-4" variant="outline" asChild><Link to="/events/$eventId/roster" params={{ eventId }}>Open Roster</Link></Button></CardContent></Card></div>
  </div>
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) { return <div><p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{icon}{label}</p><p className="mt-1 font-medium">{value}</p></div> }
