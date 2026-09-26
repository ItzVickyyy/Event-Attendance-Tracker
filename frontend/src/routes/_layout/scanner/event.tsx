import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { EventsService } from "@/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/scanner/event")({ component: ScannerEventSelection })

function ScannerEventSelection() {
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ["scanner-events"], queryFn: () => EventsService.readEvents({ query: { skip: 0, limit: 100 } }) })
  const events = data?.data?.data ?? []
  return <div className="mx-auto max-w-3xl space-y-6"><div><h1 className="text-2xl font-semibold tracking-tight">Scanner</h1><p className="text-sm text-muted-foreground">Select an event before opening the scanning workspace.</p></div><Card><CardHeader><CardTitle>Select Event</CardTitle></CardHeader><CardContent className="grid gap-3">{events.length === 0 ? <p className="text-sm text-muted-foreground">No events available.</p> : events.map((event) => <Button key={event.id} variant="outline" className="h-auto justify-between py-4" onClick={() => navigate({ to: "/scanner", search: { event_id: event.id } })}><span className="text-left"><span className="block font-medium">{event.event_name}</span><span className="text-xs text-muted-foreground">{event.event_date} · {event.location || "No location"}</span></span><span className="text-xs text-muted-foreground">Open scanner</span></Button>)}</CardContent></Card></div>
}
