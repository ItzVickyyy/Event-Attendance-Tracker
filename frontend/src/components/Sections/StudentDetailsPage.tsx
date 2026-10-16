import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, CreditCard, History, UserRound, Wifi } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  AcademicProgramsService,
  AcademicSectionsService,
  AttendanceService,
  AttendeeCredentialsService,
  AttendeeRelationshipsService,
  AttendeesService,
  EventRegistrationsService,
  PeopleService,
  type RelationshipType,
  StudentsService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  attendeeCredentialsQueryKey,
  attendeeIdQueryKey,
} from "@/lib/attendeeQueryKeys"

export function StudentDetailsPage({
  sectionId,
  studentId,
  returnToSearch = false,
}: {
  sectionId: string
  studentId: string
  returnToSearch?: boolean
}) {
  const queryClient = useQueryClient()
  const [credentialValue, setCredentialValue] = useState("")
  const [scanningNfc, setScanningNfc] = useState(false)
  const [guardianFormOpen, setGuardianFormOpen] = useState(false)
  const [guardianFirstName, setGuardianFirstName] = useState("")
  const [guardianLastName, setGuardianLastName] = useState("")
  const [guardianContact, setGuardianContact] = useState("")
  const [guardianEmail, setGuardianEmail] = useState("")
  const [guardianRelationshipType, setGuardianRelationshipType] =
    useState<RelationshipType>("guardian")
  const studentQuery = useQuery({
    queryKey: ["student", studentId],
    queryFn: () =>
      StudentsService.readStudent({ path: { student_id: studentId } }),
  })
  const student = studentQuery.data?.data
  const sectionEnrollmentQuery = useQuery({
    queryKey: ["studentEnrollmentInSection", studentId, sectionId],
    queryFn: async () => {
      const token = localStorage.getItem("access_token")
      const response = await fetch(
        `/api/v1/academic-registry/students/${encodeURIComponent(studentId)}?section_id=${encodeURIComponent(sectionId)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      )
      const body = await response.json().catch(() => null)
      if (response.status === 404) return null
      if (!response.ok)
        throw new Error(body?.detail ?? "Unable to verify section enrollment")
      return body
    },
    enabled: Boolean(studentId && sectionId),
  })
  const personQuery = useQuery({
    queryKey: ["person", student?.person_id],
    queryFn: () =>
      PeopleService.readPerson({ path: { person_id: student!.person_id } }),
    enabled: Boolean(student?.person_id),
  })
  const sectionQuery = useQuery({
    queryKey: ["academicSection", sectionId],
    queryFn: () =>
      AcademicSectionsService.sectionsReadAcademicSection({
        path: { section_id: sectionId },
      }),
    enabled: Boolean(sectionId),
  })
  const programsQuery = useQuery({
    queryKey: ["academicPrograms", "student-detail"],
    queryFn: () =>
      AcademicProgramsService.programsReadAcademicPrograms({
        query: { skip: 0, limit: 100 },
      }),
    enabled: Boolean(sectionId),
  })
  const attendeeQuery = useQuery({
    queryKey: attendeeIdQueryKey({
      id: studentId,
      person_id: student?.person_id,
    }),
    queryFn: async () => {
      const result = await AttendeesService.readAttendees({
        query: { person_id: student!.person_id, limit: 1 },
        throwOnError: true,
      })
      const attendees = (
        result as unknown as {
          data: { data: { id: string; person_id: string }[] }
        }
      ).data.data
      return attendees[0]?.id ?? null
    },
    enabled: Boolean(student?.person_id),
  })
  const attendeeId = student?.attendee_id ?? attendeeQuery.data
  const credentialsQuery = useQuery({
    queryKey: ["studentCredentials", attendeeId],
    queryFn: () =>
      AttendeeCredentialsService.credentialsReadAttendeeCredentials({
        query: { attendee_id: attendeeId! },
      }),
    enabled: Boolean(attendeeId),
  })
  const relationshipsQuery = useQuery({
    queryKey: ["studentRelationships", studentId],
    queryFn: () =>
      AttendeeRelationshipsService.relationshipsReadAttendeeRelationships({
        query: { related_student_id: studentId },
      }),
    enabled: Boolean(attendeeId),
  })
  const registrationsQuery = useQuery({
    queryKey: ["studentRegistrations", attendeeId],
    queryFn: () =>
      EventRegistrationsService.registrationsReadEventRegistrations({
        query: { attendee_id: attendeeId! },
      }),
    enabled: Boolean(attendeeId),
  })
  const registrationIds = useMemo(() => {
    const payload = registrationsQuery.data?.data as unknown
    const registrations = Array.isArray(payload)
      ? payload
      : payload &&
          typeof payload === "object" &&
          "data" in payload &&
          Array.isArray(payload.data)
        ? payload.data
        : []
    return registrations.map((registration) => registration.id)
  }, [registrationsQuery.data])
  const attendanceHistoryQuery = useQuery({
    queryKey: ["studentAttendanceHistory", registrationIds],
    queryFn: async () => {
      const results = await Promise.all(
        registrationIds.map((registrationId) =>
          AttendanceService.readAttendances({
            query: { registration_id: registrationId, skip: 0, limit: 1 },
          }),
        ),
      )
      return results.flatMap((result) =>
        Array.isArray(result.data?.data) ? result.data.data : [],
      )
    },
    enabled: registrationIds.length > 0,
  })
  const guardianMutation = useMutation({
    meta: { skipGlobalInvalidation: true },
    mutationFn: async () => {
      const person = await PeopleService.createPerson({
        body: {
          first_name: guardianFirstName.trim(),
          last_name: guardianLastName.trim(),
          contact_number: guardianContact.trim() || null,
          email: guardianEmail.trim() || null,
        },
        throwOnError: true,
      })
      const attendee = await AttendeesService.createAttendee({
        body: {
          person_id: person.data.id,
          attendee_type: "parent_guardian",
        },
        throwOnError: true,
      })
      return AttendeeRelationshipsService.relationshipsCreateAttendeeRelationship(
        {
          body: {
            attendee_id: attendee.data.id,
            related_student_id: studentId,
            relationship_type: guardianRelationshipType,
          },
          throwOnError: true,
        },
      )
    },
    onSuccess: async () => {
      toast.success("Guardian or parent contact added")
      setGuardianFormOpen(false)
      setGuardianFirstName("")
      setGuardianLastName("")
      setGuardianContact("")
      setGuardianEmail("")
      setGuardianRelationshipType("guardian")
      await queryClient.invalidateQueries({
        queryKey: ["studentRelationships", studentId],
      })
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to add guardian or parent contact",
      )
    },
  })
  const credentialMutation = useMutation({
    meta: { skipGlobalInvalidation: true },
    mutationFn: () =>
      AttendeeCredentialsService.credentialsCreateAttendeeCredential({
        body: {
          attendee_id: attendeeId!,
          credential_type: "nfc",
          credential_value: credentialValue.trim().toUpperCase(),
          is_active: true,
        },
      }),
    onSuccess: () => {
      setCredentialValue("")
      void queryClient.invalidateQueries({
        queryKey: ["studentCredentials", attendeeId],
      })
      void queryClient.invalidateQueries({
        queryKey: attendeeCredentialsQueryKey(attendeeId),
      })
    },
  })
  const revokeMutation = useMutation({
    meta: { skipGlobalInvalidation: true },
    mutationFn: (credentialId: string) =>
      AttendeeCredentialsService.credentialsUpdateAttendeeCredential({
        path: { credential_id: credentialId },
        body: { is_active: false },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["studentCredentials", attendeeId],
      })
      void queryClient.invalidateQueries({
        queryKey: attendeeCredentialsQueryKey(attendeeId),
      })
    },
  })
  const handleScanNfc = async () => {
    if (!("NDEFReader" in window)) {
      toast.error(
        "Web NFC is not supported here. Use Chrome on Android or enter the UID manually.",
      )
      return
    }

    let reader: any
    let timeoutId: number | undefined
    setScanningNfc(true)
    try {
      reader = new (window as any).NDEFReader()
      await reader.scan()
      const captured = await new Promise<string>((resolve, reject) => {
        const cleanup = () => {
          reader.removeEventListener("reading", onReading)
          if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        }
        const onReading = (event: any) => {
          const serial =
            typeof event.serialNumber === "string"
              ? event.serialNumber.trim()
              : ""
          let textRecord = ""
          for (const record of event.message?.records ?? []) {
            if (
              record.recordType !== "text" ||
              !(record.data instanceof DataView)
            )
              continue
            const data = record.data
            if (!data.byteLength) continue
            const status = data.getUint8(0)
            const languageLength = status & 0x3f
            const start = 1 + languageLength
            if (start < data.byteLength) {
              textRecord = new TextDecoder(
                (status & 0x80) !== 0 ? "utf-16" : "utf-8",
              )
                .decode(
                  new Uint8Array(
                    data.buffer,
                    data.byteOffset + start,
                    data.byteLength - start,
                  ),
                )
                .trim()
              if (textRecord) break
            }
          }
          const value = textRecord || serial
          if (!value) return
          cleanup()
          resolve(value.toUpperCase())
        }
        reader.addEventListener("reading", onReading)
        timeoutId = window.setTimeout(() => {
          cleanup()
          reject(
            new Error(
              "No NFC identifier was received within 30 seconds. Try again or enter the UID manually.",
            ),
          )
        }, 30000)
      })
      setCredentialValue(captured)
      toast.success("Card UID captured. Click Issue / Reissue to save it.")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to read NFC card",
      )
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      setScanningNfc(false)
    }
  }

  const section = sectionQuery.data?.data
  const program = section
    ? programsQuery.data?.data.data.find(
        (item) => item.id === section.program_id,
      )
    : undefined

  if (studentQuery.isLoading)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading student…
        </CardContent>
      </Card>
    )
  if (studentQuery.isError || !student)
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Student not found.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The requested student could not be loaded.
          </p>
          <Button className="mt-4" variant="outline" asChild>
            {returnToSearch ? (
              <Link to="/sections">
                <ArrowLeft />
                Back to student search
              </Link>
            ) : (
              <Link to="/sections">
                <ArrowLeft />
                Back to sections
              </Link>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  if (sectionEnrollmentQuery.isLoading)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Verifying section enrollment…
        </CardContent>
      </Card>
    )
  if (sectionEnrollmentQuery.isError || sectionEnrollmentQuery.data === null)
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">
            {sectionEnrollmentQuery.isError
              ? "Unable to verify section enrollment."
              : "Student is not part of this section."}
          </p>
          <Button className="mt-4" variant="outline" asChild>
            {returnToSearch ? (
              <Link to="/sections">
                <ArrowLeft />
                Back to student search
              </Link>
            ) : (
              <Link to="/sections/$sectionId" params={{ sectionId }}>
                <ArrowLeft />
                Back to section
              </Link>
            )}
          </Button>
        </CardContent>
      </Card>
    )

  const person = personQuery.data?.data
  const fullName = person
    ? [
        person.first_name,
        person.middle_name,
        person.last_name,
        person.name_extension,
      ]
        .filter(Boolean)
        .join(" ")
    : (student.person_name ?? "Unknown")
  const credentials = credentialsQuery.data?.data.data ?? []
  const relationships = relationshipsQuery.data?.data.data ?? []
  const attendanceHistory = attendanceHistoryQuery.data ?? []
  const nfcCredentials = credentials.filter(
    (credential) => credential.credential_type === "nfc",
  )

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          {returnToSearch ? (
            <Link to="/sections">
              <ArrowLeft />
              Back to student search
            </Link>
          ) : (
            <Link to="/sections/$sectionId/students" params={{ sectionId }}>
              <ArrowLeft />
              Students
            </Link>
          )}
        </Button>
        <div className="mt-4 flex items-start gap-3">
          <div className="rounded-lg border p-2">
            <UserRound className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Student Details</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {fullName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {student.student_number}
            </p>
          </div>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Student Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Info label="Full name" value={fullName} />
          <Info label="Student number" value={student.student_number} />
          <Info
            label="Academic status"
            value={
              sectionEnrollmentQuery.data?.student_status ??
              (student.academic_status ? String(student.academic_status) : "—")
            }
          />
          <Info label="Contact number" value={person?.contact_number ?? "—"} />
          <Info label="Email" value={person?.email ?? "—"} />
          <Info
            label="Program"
            value={
              program
                ? `${program.program_code} · ${program.program_name}`
                : "—"
            }
          />
          <Info label="Year level" value={section?.year_level ?? "—"} />
          <Info label="Section" value={section?.section_name ?? "—"} />
          <Info label="Academic year" value={section?.academic_year ?? "—"} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guardian / Parent Contact</CardTitle>
        </CardHeader>
        <CardContent>
          {relationshipsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading guardian relationships…
            </p>
          ) : relationshipsQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                Unable to load guardian or parent contacts.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void relationshipsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : relationships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No guardian or parent relationship is currently recorded.
            </p>
          ) : (
            <div className="space-y-3">
              {relationships.map((relationship) => (
                <GuardianRow
                  key={relationship.id}
                  relationship={relationship}
                />
              ))}
            </div>
          )}
          <div className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setGuardianFormOpen((open) => !open)}
            >
              {guardianFormOpen ? "Cancel" : "Add guardian / parent"}
            </Button>
          </div>
          {guardianFormOpen && (
            <form
              className="mt-4 space-y-4 rounded-lg border p-4"
              onSubmit={(event) => {
                event.preventDefault()
                guardianMutation.mutate()
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="guardian-first-name"
                    className="text-sm font-medium"
                  >
                    First name *
                  </label>
                  <Input
                    id="guardian-first-name"
                    value={guardianFirstName}
                    onChange={(event) =>
                      setGuardianFirstName(event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="guardian-last-name"
                    className="text-sm font-medium"
                  >
                    Last name *
                  </label>
                  <Input
                    id="guardian-last-name"
                    value={guardianLastName}
                    onChange={(event) =>
                      setGuardianLastName(event.target.value)
                    }
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="guardian-relationship"
                    className="text-sm font-medium"
                  >
                    Relationship
                  </label>
                  <select
                    id="guardian-relationship"
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={guardianRelationshipType}
                    onChange={(event) =>
                      setGuardianRelationshipType(
                        event.target.value as RelationshipType,
                      )
                    }
                  >
                    <option value="mother">Mother</option>
                    <option value="father">Father</option>
                    <option value="guardian">Guardian</option>
                    <option value="grandparent">Grandparent</option>
                    <option value="sibling">Sibling</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="guardian-contact"
                    className="text-sm font-medium"
                  >
                    Contact number
                  </label>
                  <Input
                    id="guardian-contact"
                    value={guardianContact}
                    onChange={(event) => setGuardianContact(event.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label
                    htmlFor="guardian-email"
                    className="text-sm font-medium"
                  >
                    Email
                  </label>
                  <Input
                    id="guardian-email"
                    type="email"
                    value={guardianEmail}
                    onChange={(event) => setGuardianEmail(event.target.value)}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={
                  !guardianFirstName.trim() ||
                  !guardianLastName.trim() ||
                  guardianMutation.isPending
                }
              >
                {guardianMutation.isPending
                  ? "Saving contact…"
                  : "Save contact"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" />
            Attendance History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {registrationsQuery.isLoading || attendanceHistoryQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading attendance history…
            </p>
          ) : attendanceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No attendance records are currently available for this student.
            </p>
          ) : (
            <div className="space-y-3">
              {attendanceHistory.map((record) => (
                <div key={record.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {record.status ?? "Attendance"}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {record.time_in
                        ? new Date(record.time_in).toLocaleString()
                        : "No time-in"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.time_out
                      ? `Time-out: ${new Date(record.time_out).toLocaleString()}`
                      : "No time-out recorded"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="size-4" />
            NFC Credential
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!student?.attendee_id && attendeeQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Checking attendee link…
            </p>
          ) : !student?.attendee_id && attendeeQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">
                Unable to check the attendee link.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void attendeeQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : !attendeeId ? (
            <p className="text-sm text-muted-foreground">
              This student is not linked to an attendee record, so NFC
              credential management is unavailable.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                {nfcCredentials.map((credential) => (
                  <div
                    key={credential.id}
                    className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium">
                        {credential.credential_value}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {credential.is_active ? "Active" : "Revoked"}
                      </p>
                    </div>
                    {credential.is_active && (
                      <Button
                        variant="outline"
                        onClick={() => revokeMutation.mutate(credential.id)}
                        disabled={revokeMutation.isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
                {nfcCredentials.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No NFC credential is currently assigned.
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={credentialValue}
                  onChange={(event) => setCredentialValue(event.target.value)}
                  placeholder="Scan card or enter UID"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleScanNfc()}
                  disabled={scanningNfc || credentialMutation.isPending}
                >
                  <Wifi className="mr-2 size-4" />
                  {scanningNfc ? "Tap card..." : "Scan card"}
                </Button>
                <Button
                  onClick={() => credentialMutation.mutate()}
                  disabled={
                    !credentialValue.trim() || credentialMutation.isPending
                  }
                >
                  Issue / Reissue
                </Button>
              </div>
              {credentialMutation.isError && (
                <p className="text-sm text-destructive">
                  The credential could not be issued.
                </p>
              )}
              {revokeMutation.isError && (
                <p className="text-sm text-destructive">
                  The credential could not be revoked.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GuardianRow({
  relationship,
}: {
  relationship: { id: string; attendee_id: string; relationship_type?: string }
}) {
  const attendeeQuery = useQuery({
    queryKey: ["attendee", relationship.attendee_id],
    queryFn: () =>
      AttendeesService.readAttendee({
        path: { attendee_id: relationship.attendee_id },
      }),
  })
  const personId = attendeeQuery.data?.data.person_id
  const personQuery = useQuery({
    queryKey: ["guardianPerson", personId],
    queryFn: () => PeopleService.readPerson({ path: { person_id: personId! } }),
    enabled: Boolean(personId),
  })
  const person = personQuery.data?.data
  const name = person
    ? [
        person.first_name,
        person.middle_name,
        person.last_name,
        person.name_extension,
      ]
        .filter(Boolean)
        .join(" ")
    : attendeeQuery.isLoading || personQuery.isLoading
      ? "Loading…"
      : "Contact unavailable"
  return (
    <div className="rounded-lg border p-3">
      <p className="font-medium">{name}</p>
      <p className="text-sm capitalize text-muted-foreground">
        {relationship.relationship_type?.replace("_", " ") ?? "Guardian"}
      </p>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <span>
          {personQuery.isLoading
            ? "Loading contact…"
            : (person?.contact_number ?? "No contact number")}
        </span>
        <span>
          {personQuery.isLoading
            ? "Loading email…"
            : (person?.email ?? "No email")}
        </span>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  )
}
