import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Check, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { AcademicSectionsService, EventRegistrationsService, EventsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function EventRegistrationPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const eventQuery = useQuery({ queryKey: ["event", eventId], queryFn: () => EventsService.readEvent({ path: { event_id: eventId } }) })
  const sectionsQuery = useQuery({ queryKey: ["sections", "registration"], queryFn: () => AcademicSectionsService.sectionsReadAcademicSections({ query: { skip: 0, limit: 200 } }) })
  const registrationQuery = useQuery({ queryKey: ["eventRegistrations", eventId], queryFn: () => EventRegistrationsService.registrationsReadEventRegistrations({ query: { event_id: eventId, skip: 0, limit: 1000 } }) })
  const studentQueries = useQuery({
    queryKey: ["registrationStudents", selectedSections],
    enabled: selectedSections.length > 0,
    queryFn: async () => {
      const results = await Promise.all(selectedSections.map((sectionId) => StudentsService.readStudents({ query: { section_id: sectionId, skip: 0, limit: 1000 } })))
      return results.flatMap((result) => result.data.data)
    },
  })
  const mutation = useMutation({
    mutationFn: async () => {
      const existing = new Set((registrationQuery.data?.data.data ?? []).map((item) => item.attendee_id))
      const students = (studentQueries.data ?? []).filter((student) => student.attendee_id && !existing.has(student.attendee_id))
      for (const student of students) await EventRegistrationsService.registrationsCreateEventRegistration({ body: { event_id: eventId, attendee_id: student.attendee_id!, registration_status: "registered" } })
      return students.length
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["eventRegistrations", eventId] }),
  })
  const registered = registrationQuery.data?.data.data ?? []
  const students = studentQueries.data ?? []
  const eligibleCount = useMemo(() => students.filter((student) => student.attendee_id).length, [students])
  const missing = Math.max(0, eligibleCount - students.filter((student) => student.attendee_id && registered.some((item) => item.attendee_id === student.attendee_id)).length)
  const event = eventQuery.data?.data
  if (eventQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading event…</CardContent></Card>
  if (!event) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Event not found.</p><Button className="mt-4" variant="outline" asChild><Link to="/events"><ArrowLeft />Back to events</Link></Button></CardContent></Card>
  return <div className="space-y-6">
    <header><Button variant="ghost" size="sm" asChild><Link to="/events/$eventId" params={{ eventId }}><ArrowLeft />Event Details</Link></Button><p className="mt-4 text-sm text-muted-foreground">Registration</p><h1 className="text-2xl font-semibold tracking-tight">{event.event_name}</h1><p className="mt-1 text-sm text-muted-foreground">Select sections to define the expected student population.</p></header>
    <Card><CardHeader><CardTitle className="text-base">Eligible Sections</CardTitle></CardHeader><CardContent className="space-y-3">{sectionsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading sections…</p> : (sectionsQuery.data?.data.data ?? []).map((section) => { const checked = selectedSections.includes(section.id); return <label key={section.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/50"><input type="checkbox" checked={checked} onChange={() => setSelectedSections((current) => checked ? current.filter((id) => id !== section.id) : [...current, section.id])} /><span className="flex-1"><span className="block font-medium">{section.section_name}</span><span className="text-sm text-muted-foreground">Year {section.year_level} · {section.academic_year}</span></span></label> })}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="size-4" />Registration Summary</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><Stat label="Registered" value={registered.length} /><Stat label="Selected students" value={eligibleCount} /><Stat label="To add" value={missing} /></div><Button disabled={selectedSections.length === 0 || eligibleCount === 0 || mutation.isPending} onClick={() => mutation.mutate()}><Check />{mutation.isPending ? "Registering…" : "Register selected sections"}</Button>{mutation.isSuccess && <p className="text-sm text-muted-foreground">Registration population updated.</p>}{mutation.isError && <p className="text-sm text-destructive">Some registrations could not be created. Refresh and retry.</p>}</CardContent></Card>
    <div className="flex gap-2"><Button variant="outline" asChild><Link to="/events/$eventId/roster" params={{ eventId }}>Open Roster</Link></Button></div>
  </div>
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div> }
