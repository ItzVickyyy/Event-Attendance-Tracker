import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, CreditCard, History, UserRound } from "lucide-react"
import { AcademicProgramsService, AcademicSectionsService, AttendeeCredentialsService, AttendeeRelationshipsService, AttendeesService, AttendanceService, EventRegistrationsService, PeopleService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export function StudentDetailsPage({ sectionId, studentId }: { sectionId: string; studentId: string }) {
  const queryClient = useQueryClient()
  const [credentialValue, setCredentialValue] = useState("")
  const studentQuery = useQuery({ queryKey: ["student", studentId], queryFn: () => StudentsService.readStudent({ path: { student_id: studentId } }) })
  const student = studentQuery.data?.data
  const personQuery = useQuery({ queryKey: ["person", student?.person_id], queryFn: () => PeopleService.readPerson({ path: { person_id: student!.person_id } }), enabled: Boolean(student?.person_id) })
  const sectionQuery = useQuery({ queryKey: ["academicSection", student?.section_id], queryFn: () => AcademicSectionsService.sectionsReadAcademicSection({ path: { section_id: student!.section_id! } }), enabled: Boolean(student?.section_id) })
  const programsQuery = useQuery({ queryKey: ["academicPrograms", "student-detail"], queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }), enabled: Boolean(student?.section_id) })
  const credentialsQuery = useQuery({ queryKey: ["studentCredentials", student?.attendee_id], queryFn: () => AttendeeCredentialsService.credentialsReadAttendeeCredentials({ query: { attendee_id: student!.attendee_id! } }), enabled: Boolean(student?.attendee_id) })
  const relationshipsQuery = useQuery({ queryKey: ["studentRelationships", studentId], queryFn: () => AttendeeRelationshipsService.relationshipsReadAttendeeRelationships({ query: { related_student_id: studentId } }), enabled: Boolean(student?.attendee_id) })
  const registrationsQuery = useQuery({ queryKey: ["studentRegistrations", student?.attendee_id], queryFn: () => EventRegistrationsService.registrationsReadEventRegistrations({ query: { attendee_id: student!.attendee_id! } }), enabled: Boolean(student?.attendee_id) })
  const registrationIds = useMemo(() => registrationsQuery.data?.data.data.map((registration) => registration.id) ?? [], [registrationsQuery.data])
  const attendanceHistoryQuery = useQuery({ queryKey: ["studentAttendanceHistory", registrationIds], queryFn: async () => { const results = await Promise.all(registrationIds.map((registrationId) => AttendanceService.readAttendances({ query: { registration_id: registrationId, skip: 0, limit: 1 } }))); return results.flatMap((result) => result.data.data) }, enabled: registrationIds.length > 0 })
  const credentialMutation = useMutation({ mutationFn: () => AttendeeCredentialsService.credentialsCreateAttendeeCredential({ body: { attendee_id: student!.attendee_id!, credential_type: "nfc", credential_value: credentialValue.trim(), is_active: true } }), onSuccess: () => { setCredentialValue(""); void queryClient.invalidateQueries({ queryKey: ["studentCredentials", student?.attendee_id] }) } })
  const revokeMutation = useMutation({ mutationFn: (credentialId: string) => AttendeeCredentialsService.credentialsUpdateAttendeeCredential({ path: { credential_id: credentialId }, body: { is_active: false } }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["studentCredentials", student?.attendee_id] }) })
  const section = sectionQuery.data?.data
  const program = section ? programsQuery.data?.data.data.find((item) => item.id === section.program_id) : undefined

  if (studentQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading student…</CardContent></Card>
  if (studentQuery.isError || !student) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Student not found.</p><p className="mt-1 text-sm text-muted-foreground">The requested student could not be loaded.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections"><ArrowLeft />Back to sections</Link></Button></CardContent></Card>
  if (student.section_id !== sectionId) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Student is not part of this section.</p><p className="mt-1 text-sm text-muted-foreground">This route does not expose students outside the selected section.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections/$sectionId" params={{ sectionId }}><ArrowLeft />Back to section</Link></Button></CardContent></Card>

  const person = personQuery.data?.data
  const fullName = person ? [person.first_name, person.middle_name, person.last_name, person.name_extension].filter(Boolean).join(" ") : student.person_name ?? "Unknown"
  const credentials = credentialsQuery.data?.data.data ?? []
  const relationships = relationshipsQuery.data?.data.data ?? []
  const attendanceHistory = attendanceHistoryQuery.data ?? []
  const nfcCredentials = credentials.filter((credential) => credential.credential_type === "nfc")

  return <div className="space-y-6">
    <div><Button variant="ghost" size="sm" asChild><Link to="/sections/$sectionId/students" params={{ sectionId }}><ArrowLeft />Students</Link></Button><div className="mt-4 flex items-start gap-3"><div className="rounded-lg border p-2"><UserRound className="size-5 text-muted-foreground" /></div><div><p className="text-sm text-muted-foreground">Student Details</p><h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1><p className="mt-1 text-sm text-muted-foreground">{student.student_number}</p></div></div></div>
    <Card><CardHeader><CardTitle className="text-base">Student Information</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Full name" value={fullName} /><Info label="Student number" value={student.student_number} /><Info label="Academic status" value={student.academic_status ? String(student.academic_status) : "—"} /><Info label="Contact number" value={person?.contact_number ?? "—"} /><Info label="Email" value={person?.email ?? "—"} /><Info label="Program" value={program ? `${program.program_code} · ${program.program_name}` : "—"} /><Info label="Year level" value={section?.year_level ?? "—"} /><Info label="Section" value={section?.section_name ?? "—"} /><Info label="Academic year" value={section?.academic_year ?? "—"} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">Guardian / Parent Contact</CardTitle></CardHeader><CardContent>{relationshipsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading guardian relationships…</p> : relationships.length === 0 ? <p className="text-sm text-muted-foreground">No guardian or parent relationship is currently recorded.</p> : <div className="space-y-3">{relationships.map((relationship) => <GuardianRow key={relationship.id} relationship={relationship} />)}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="size-4" />Attendance History</CardTitle></CardHeader><CardContent>{registrationsQuery.isLoading || attendanceHistoryQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading attendance history…</p> : attendanceHistory.length === 0 ? <p className="text-sm text-muted-foreground">No attendance records are currently available for this student.</p> : <div className="space-y-3">{attendanceHistory.map((record) => <div key={record.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{record.status ?? "Attendance"}</span><span className="text-sm text-muted-foreground">{record.time_in ? new Date(record.time_in).toLocaleString() : "No time-in"}</span></div><p className="mt-1 text-sm text-muted-foreground">{record.time_out ? `Time-out: ${new Date(record.time_out).toLocaleString()}` : "No time-out recorded"}</p></div>)}</div>}</CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CreditCard className="size-4" />NFC Credential</CardTitle></CardHeader><CardContent className="space-y-4">{!student.attendee_id ? <p className="text-sm text-muted-foreground">This student is not linked to an attendee record, so NFC credential management is unavailable.</p> : <><div className="space-y-3">{nfcCredentials.map((credential) => <div key={credential.id} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{credential.credential_value}</p><p className="text-sm text-muted-foreground">{credential.is_active ? "Active" : "Revoked"}</p></div>{credential.is_active && <Button variant="outline" onClick={() => revokeMutation.mutate(credential.id)} disabled={revokeMutation.isPending}>Revoke</Button>}</div>)}{nfcCredentials.length === 0 && <p className="text-sm text-muted-foreground">No NFC credential is currently assigned.</p>}</div><div className="flex flex-col gap-2 sm:flex-row"><Input value={credentialValue} onChange={(event) => setCredentialValue(event.target.value)} placeholder="Enter NFC card UID" /><Button onClick={() => credentialMutation.mutate()} disabled={!credentialValue.trim() || credentialMutation.isPending}>Issue / Reissue</Button></div>{credentialMutation.isError && <p className="text-sm text-destructive">The credential could not be issued.</p>}{revokeMutation.isError && <p className="text-sm text-destructive">The credential could not be revoked.</p>}</>}</CardContent></Card>
    <Button variant="outline" asChild><Link to="/sections/$sectionId" params={{ sectionId }}>View Section</Link></Button>
  </div>
}

function GuardianRow({ relationship }: { relationship: { id: string; attendee_id: string; relationship_type?: string } }) {
  const attendeeQuery = useQuery({ queryKey: ["attendee", relationship.attendee_id], queryFn: () => AttendeesService.readAttendee({ path: { attendee_id: relationship.attendee_id } }) })
  const personId = attendeeQuery.data?.data.person_id
  const personQuery = useQuery({ queryKey: ["guardianPerson", personId], queryFn: () => PeopleService.readPerson({ path: { person_id: personId! } }), enabled: Boolean(personId) })
  const person = personQuery.data?.data
  const name = person ? [person.first_name, person.middle_name, person.last_name, person.name_extension].filter(Boolean).join(" ") : "Loading…"
  return <div className="rounded-lg border p-3"><p className="font-medium">{name}</p><p className="text-sm capitalize text-muted-foreground">{relationship.relationship_type?.replace("_", " ") ?? "Guardian"}</p><div className="mt-2 grid gap-2 text-sm sm:grid-cols-2"><span>{person?.contact_number ?? "No contact number"}</span><span>{person?.email ?? "No email"}</span></div></div>
}

function Info({ label, value }: { label: string; value: string | number }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div> }
