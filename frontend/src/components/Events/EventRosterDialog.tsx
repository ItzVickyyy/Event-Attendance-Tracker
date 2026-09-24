import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle, Loader2, Plus, Search, Trash2, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  AttendanceService,
  AttendeesService,
  type EventPublic,
  EventRegistrationsService,
  EventsService,
  type RosterEntry,
  type StudentPublic,
  StudentsService,
} from "@/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"

interface EventRosterDialogProps {
  event: EventPublic
}

export function EventRosterDialog({ event }: EventRosterDialogProps) {
  const [open, setOpen] = useState(false)
  const [searchRoster, setSearchRoster] = useState("")
  const [searchStudent, setSearchStudent] = useState("")
  const queryClient = useQueryClient()

  // 1. Fetch Event Roster
  const {
    data: rosterResponse,
    isLoading: isLoadingRoster,
    refetch: refetchRoster,
  } = useQuery({
    queryKey: ["eventRoster", event.id],
    queryFn: async () => {
      const res = await EventsService.readEventRoster({
        path: { event_id: event.id },
        throwOnError: true,
      })
      return (
        res as unknown as { data: { data: RosterEntry[]; count: number } }
      ).data
    },
    enabled: open,
  })

  // 2. Fetch Event Registrations mapping (to get registration_id for delete)
  const { data: registrationsResponse, refetch: refetchRegistrations } =
    useQuery({
      queryKey: ["eventRegistrations", event.id],
      queryFn: async () => {
        const res =
          await EventRegistrationsService.registrationsReadEventRegistrations({
            query: { event_id: event.id, limit: 1000 },
            throwOnError: true,
          })
        return res.data
      },
      enabled: open,
    })

  // 3. Fetch Event Attendances (to show if attendee is already checked in/out)
  const { data: attendanceResponse, refetch: refetchAttendance } = useQuery({
    queryKey: ["eventAttendance", event.id],
    queryFn: async () => {
      const res = await AttendanceService.readAttendances({
        query: { event_id: event.id, limit: 1000 },
        throwOnError: true,
      })
      return res.data
    },
    enabled: open,
  })

  // 4. Search Students for Adding
  const { data: studentSearchResponse, isLoading: isSearchingStudents } =
    useQuery({
      queryKey: ["studentsSearch", searchStudent],
      queryFn: async () => {
        if (!searchStudent.trim()) return { data: [], count: 0 }
        const res = await StudentsService.readStudents({
          query: { search: searchStudent.trim(), limit: 10 },
          throwOnError: true,
        })
        return res.data
      },
      enabled: open && searchStudent.trim().length > 0,
    })

  const rosterEntries = rosterResponse?.data ?? []
  const registrations = registrationsResponse?.data ?? []
  const attendances = attendanceResponse?.data ?? []

  // Map attendee_id to registration record
  const registrationByAttendeeId = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of registrations) {
      map.set(r.attendee_id, r.id)
    }
    return map
  }, [registrations])

  // Map registration_id to attendance status
  const attendanceByRegId = useMemo(() => {
    const map = new Map<
      string,
      {
        status: string
        time_in?: string | null
        time_out?: string | null
      }
    >()
    for (const a of attendances) {
      if (a.registration_id) {
        map.set(a.registration_id, {
          status: a.status ?? "present",
          time_in: a.time_in,
          time_out: a.time_out,
        })
      }
    }
    return map
  }, [attendances])

  // Filtered Roster entries
  const filteredRoster = useMemo(() => {
    if (!searchRoster.trim()) return rosterEntries
    const q = searchRoster.toLowerCase()
    return rosterEntries.filter(
      (entry) =>
        entry.person_name.toLowerCase().includes(q) ||
        entry.student_number?.toLowerCase().includes(q),
    )
  }, [rosterEntries, searchRoster])

  // Mutation to Add Student to Roster
  const addStudentMutation = useMutation({
    mutationFn: async (student: StudentPublic) => {
      // 1. Resolve Attendee record
      const attendeeRes = await AttendeesService.readAttendees({
        query: { person_id: student.person_id, limit: 1 },
        throwOnError: true,
      })
      const attendees = (
        attendeeRes as unknown as {
          data: { data: { id: string; person_id: string }[] }
        }
      ).data.data
      let attendeeId = attendees[0]?.id
      if (!attendeeId) {
        const created = await AttendeesService.createAttendee({
          body: { person_id: student.person_id, attendee_type: "student" },
          throwOnError: true,
        })
        attendeeId = (created as unknown as { data: { id: string } }).data.id
      }

      // 2. Create Event Registration
      await EventRegistrationsService.registrationsCreateEventRegistration({
        body: {
          event_id: event.id,
          attendee_id: attendeeId,
          registration_status: "registered",
        },
        throwOnError: true,
      })
    },
    onSuccess: () => {
      toast.success("Attendee registered for event")
      queryClient.invalidateQueries({ queryKey: ["eventRoster", event.id] })
      queryClient.invalidateQueries({
        queryKey: ["eventRegistrations", event.id],
      })
      refetchRoster()
      refetchRegistrations()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to register attendee")
    },
  })

  // Mutation to Remove Attendee from Roster
  const removeRegistrationMutation = useMutation({
    mutationFn: async (registrationId: string) => {
      await EventRegistrationsService.registrationsDeleteEventRegistration({
        path: { registration_id: registrationId },
        throwOnError: true,
      })
    },
    onSuccess: () => {
      toast.success("Attendee removed from event roster")
      queryClient.invalidateQueries({ queryKey: ["eventRoster", event.id] })
      queryClient.invalidateQueries({
        queryKey: ["eventRegistrations", event.id],
      })
      queryClient.invalidateQueries({ queryKey: ["eventAttendance", event.id] })
      refetchRoster()
      refetchRegistrations()
      refetchAttendance()
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to remove attendee")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-1" />
          Roster
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Event Roster: {event.event_name}
          </DialogTitle>
          <DialogDescription>
            Manage registered attendees and review check-in status for this
            event.
          </DialogDescription>
        </DialogHeader>

        {/* Add Student Section */}
        <div className="rounded-lg border p-4 bg-muted/40 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Add Attendee to Roster
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search student by name or student number..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>

          {searchStudent.trim().length > 0 && (
            <div className="border rounded-md bg-background max-h-40 overflow-y-auto divide-y text-sm">
              {isSearchingStudents ? (
                <div className="p-3 flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : (studentSearchResponse?.data ?? []).length === 0 ? (
                <div className="p-3 text-center text-muted-foreground">
                  No matching students found
                </div>
              ) : (
                (studentSearchResponse?.data ?? []).map((stu) => {
                  return (
                    <div
                      key={stu.id}
                      className="p-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium">
                          {stu.person_name ?? stu.student_number}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {stu.student_number}
                        </div>
                      </div>
                      <LoadingButton
                        size="sm"
                        variant="secondary"
                        loading={addStudentMutation.isPending}
                        onClick={() => addStudentMutation.mutate(stu)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Add
                      </LoadingButton>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Roster List Section */}
        <div className="flex-1 flex flex-col min-h-0 space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold flex items-center gap-2">
              <span>Registered Attendees</span>
              <Badge variant="secondary">{rosterEntries.length}</Badge>
            </div>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter roster..."
                value={searchRoster}
                onChange={(e) => setSearchRoster(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-md divide-y min-h-[160px] max-h-[300px]">
            {isLoadingRoster ? (
              <div className="p-8 flex items-center justify-center text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading roster...
              </div>
            ) : filteredRoster.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {searchRoster
                  ? "No attendees match your filter"
                  : "No attendees registered for this event yet"}
              </div>
            ) : (
              filteredRoster.map((entry) => {
                const regId = registrationByAttendeeId.get(entry.attendee_id)
                const attendance = regId
                  ? attendanceByRegId.get(regId)
                  : undefined
                const isDeleting =
                  removeRegistrationMutation.isPending &&
                  removeRegistrationMutation.variables === regId

                return (
                  <div
                    key={entry.attendee_id}
                    className="p-3 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">
                        {entry.person_name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {entry.student_number && (
                          <span className="font-mono">
                            {entry.student_number}
                          </span>
                        )}
                        {entry.credentials && entry.credentials.length > 0 && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            {entry.credentials.length} credential
                            {entry.credentials.length === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {attendance ? (
                        <Badge
                          variant={
                            attendance.status === "present" ||
                            attendance.status === "completed"
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {attendance.status === "present"
                            ? "Present"
                            : attendance.status === "completed"
                              ? "Completed"
                              : attendance.status === "time_in_only"
                                ? "Time-In"
                                : attendance.status}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not scanned
                        </span>
                      )}

                      {regId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={isDeleting}
                          onClick={() =>
                            removeRegistrationMutation.mutate(regId)
                          }
                          title="Remove attendee from event"
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default EventRosterDialog
