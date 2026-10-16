import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Search, UserPlus } from "lucide-react"
import { useState } from "react"
import {
  AttendeesService,
  EventRegistrationsService,
  EventsService,
  PeopleService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  type AttendanceSession,
  getAttendanceSessions,
  getEventRoster,
  type SessionRosterEntry,
} from "@/data/attendanceSessions"

export function EventRosterPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [contact, setContact] = useState("")
  const [selectedSessionId, setSelectedSessionId] = useState<string>("")
  const [rosterSearch, setRosterSearch] = useState("")
  const eventQuery = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => EventsService.readEvent({ path: { event_id: eventId } }),
  })
  const sessionsQuery = useQuery({
    queryKey: ["attendanceSessions", eventId],
    queryFn: () => getAttendanceSessions(eventId),
  })
  const rosterQuery = useQuery({
    queryKey: ["eventRoster", eventId, selectedSessionId],
    queryFn: () => getEventRoster(eventId, selectedSessionId || undefined),
  })
  const walkIn = useMutation({
    meta: { skipGlobalInvalidation: true },
    mutationFn: async () => {
      const person = await PeopleService.createPerson({
        body: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          contact_number: contact.trim() || null,
        },
      })
      const attendee = await AttendeesService.createAttendee({
        body: { person_id: person.data.id, attendee_type: "guest" },
      })
      return EventRegistrationsService.registrationsCreateEventRegistration({
        body: {
          event_id: eventId,
          attendee_id: attendee.data.id,
          registration_status: "registered",
        },
      })
    },
    onSuccess: () => {
      setFirstName("")
      setLastName("")
      setContact("")
      queryClient.invalidateQueries({ queryKey: ["eventRoster", eventId] })
    },
  })
  const event = eventQuery.data?.data
  const roster: SessionRosterEntry[] = rosterQuery.data ?? []
  const normalizedRosterSearch = rosterSearch.trim().toLocaleLowerCase()
  const filteredRoster = roster.filter((entry) =>
    [entry.person_name, entry.student_number ?? ""]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalizedRosterSearch),
  )
  const sessions: AttendanceSession[] = sessionsQuery.data ?? []
  if (eventQuery.isLoading)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading event…
        </CardContent>
      </Card>
    )
  if (!event)
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Event not found.</p>
          <Button className="mt-4" variant="outline" asChild>
            <Link to="/events">
              <ArrowLeft />
              Back to events
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/events/$eventId" params={{ eventId }}>
            <ArrowLeft />
            Event Details
          </Link>
        </Button>
        <p className="mt-4 text-sm text-muted-foreground">Roster</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {event.event_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generated attendee population for this event.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Walk-In</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="walkin-first">First name</Label>
            <Input
              id="walkin-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="walkin-last">Last name</Label>
            <Input
              id="walkin-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="walkin-contact">Contact (optional)</Label>
            <Input
              id="walkin-contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Button
              disabled={
                !firstName.trim() || !lastName.trim() || walkIn.isPending
              }
              onClick={() => walkIn.mutate()}
            >
              <UserPlus />
              {walkIn.isPending ? "Adding…" : "Add walk-in"}
            </Button>
            {walkIn.isSuccess && (
              <p className="mt-2 text-sm text-muted-foreground">
                Walk-in added to this event.
              </p>
            )}
            {walkIn.isError && (
              <p className="mt-2 text-sm text-destructive">
                Unable to add walk-in.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Live Roster ({filteredRoster.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search event roster"
                placeholder="Search by attendee name or student number"
                value={rosterSearch}
                onChange={(event) => setRosterSearch(event.target.value)}
                className="pl-9"
              />
            </div>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
            >
              <option value="">All sessions</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name} · {session.session_date}
                </option>
              ))}
            </select>
            {selectedSessionId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => rosterQuery.refetch()}
              >
                Refresh
              </Button>
            )}
          </div>
          {rosterQuery.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading roster…
            </p>
          ) : rosterQuery.isError ? (
            <div className="py-8 text-center">
              <p className="font-medium">Unable to load roster.</p>
              <Button
                className="mt-3"
                variant="outline"
                size="sm"
                onClick={() => rosterQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : roster.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No attendees have been registered for this event.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Student Number</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>Scan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoster.map((entry) => (
                  <TableRow key={entry.attendee_id}>
                    <TableCell className="font-medium">
                      {entry.person_name}
                    </TableCell>
                    <TableCell>{entry.student_number ?? "Walk-in"}</TableCell>
                    <TableCell>{entry.registration_status}</TableCell>
                    <TableCell>{entry.attendance_status ?? "Absent"}</TableCell>
                    <TableCell>
                      {entry.is_late
                        ? "Late"
                        : entry.attendance_status
                          ? "On time"
                          : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.scan_method ??
                        (entry.credentials?.some(
                          (credential) => credential.is_active,
                        )
                          ? "Credential ready"
                          : "—")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {!rosterQuery.isLoading &&
            !rosterQuery.isError &&
            roster.length > 0 &&
            filteredRoster.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No attendees match your search.
              </p>
            )}
        </CardContent>
      </Card>
    </div>
  )
}
