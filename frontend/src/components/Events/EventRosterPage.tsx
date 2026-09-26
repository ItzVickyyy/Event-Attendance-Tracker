import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, UserPlus } from "lucide-react"
import { useState } from "react"
import { AttendeesService, EventsService, EventRegistrationsService, PeopleService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function EventRosterPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [contact, setContact] = useState("")
  const eventQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => EventsService.readEvent({ path: { event_id: eventId } }) })
  const rosterQuery = useQuery({ queryKey: ["eventRoster", eventId], queryFn: () => EventsService.readEventRoster({ path: { event_id: eventId } }) })
  const walkIn = useMutation({
    mutationFn: async () => {
      const person = await PeopleService.createPerson({ body: { first_name: firstName.trim(), last_name: lastName.trim(), contact_number: contact.trim() || null } })
      const attendee = await AttendeesService.createAttendee({ body: { person_id: person.data.id, attendee_type: "guest" } })
      return EventRegistrationsService.registrationsCreateEventRegistration({ body: { event_id: eventId, attendee_id: attendee.data.id, registration_status: "registered" } })
    },
    onSuccess: () => { setFirstName(""); setLastName(""); setContact(""); queryClient.invalidateQueries({ queryKey: ["eventRoster", eventId] }) },
  })
  const event = eventQuery.data?.data
  const roster = rosterQuery.data?.data.data ?? []
  if (eventQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading event…</CardContent></Card>
  if (!event) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Event not found.</p><Button className="mt-4" variant="outline" asChild><Link to="/events"><ArrowLeft />Back to events</Link></Button></CardContent></Card>
  return <div className="space-y-6">
    <header><Button variant="ghost" size="sm" asChild><Link to="/events/$eventId" params={{ eventId }}><ArrowLeft />Event Details</Link></Button><p className="mt-4 text-sm text-muted-foreground">Roster</p><h1 className="text-2xl font-semibold tracking-tight">{event.event_name}</h1><p className="mt-1 text-sm text-muted-foreground">Generated attendee population for this event.</p></header>
    <Card><CardHeader><CardTitle className="text-base">Manual Walk-In</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-3"><div><Label htmlFor="walkin-first">First name</Label><Input id="walkin-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} /></div><div><Label htmlFor="walkin-last">Last name</Label><Input id="walkin-last" value={lastName} onChange={(e) => setLastName(e.target.value)} /></div><div><Label htmlFor="walkin-contact">Contact (optional)</Label><Input id="walkin-contact" value={contact} onChange={(e) => setContact(e.target.value)} /></div><div className="sm:col-span-3"><Button disabled={!firstName.trim() || !lastName.trim() || walkIn.isPending} onClick={() => walkIn.mutate()}><UserPlus />{walkIn.isPending ? "Adding…" : "Add walk-in"}</Button>{walkIn.isSuccess && <p className="mt-2 text-sm text-muted-foreground">Walk-in added to this event.</p>}{walkIn.isError && <p className="mt-2 text-sm text-destructive">Unable to add walk-in.</p>}</div></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Live Roster ({roster.length})</CardTitle></CardHeader><CardContent>{rosterQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading roster…</p> : rosterQuery.isError ? <div className="py-8 text-center"><p className="font-medium">Unable to load roster.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => rosterQuery.refetch()}>Retry</Button></div> : roster.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No attendees have been registered for this event.</p> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Student Number</TableHead><TableHead>Registration</TableHead><TableHead>Scan Credential</TableHead></TableRow></TableHeader><TableBody>{roster.map((entry) => <TableRow key={entry.attendee_id}><TableCell className="font-medium">{entry.person_name}</TableCell><TableCell>{entry.student_number ?? "Walk-in"}</TableCell><TableCell>{entry.registration_status}</TableCell><TableCell>{entry.credentials?.some((credential) => credential.is_active) ? "Ready" : "No active credential"}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card>
  </div>
}
