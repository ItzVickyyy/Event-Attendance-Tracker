import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Check, Users } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  AcademicRegistryService,
  AcademicSectionsService,
  type EventPublic,
  EventRegistrationsService,
  EventsService,
  StudentsService,
} from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

function getYearNumber(
  yearLevel: string | number | null | undefined,
): number | null {
  const match = String(yearLevel ?? "").match(/[1-4]/)
  return match ? Number(match[0]) : null
}

export function EventRegistrationPage({ eventId }: { eventId: string }) {
  const queryClient = useQueryClient()
  const [selectedSections, setSelectedSections] = useState<string[]>([])
  const hydratedEventRef = useRef<string | null>(null)
  const autoSaveReadyRef = useRef(false)
  const eventQuery = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => EventsService.readEvent({ path: { event_id: eventId } }),
  })
  const sectionsQuery = useQuery({
    queryKey: ["sections", "registration"],
    queryFn: () =>
      AcademicSectionsService.sectionsReadAcademicSections({
        query: { skip: 0, limit: 200 },
      }),
  })
  const registrySectionsQuery = useQuery({
    queryKey: ["academicRegistrySections"],
    queryFn: () => AcademicRegistryService.registryReadSections(),
  })
  const registrationQuery = useQuery({
    queryKey: ["eventRegistrations", eventId],
    queryFn: () =>
      EventRegistrationsService.registrationsReadEventRegistrations({
        query: { event_id: eventId, skip: 0, limit: 1000 },
      }),
  })
  const registrationPayload = registrationQuery.data?.data as unknown
  const registered = Array.isArray(registrationPayload)
    ? registrationPayload
    : registrationPayload &&
        typeof registrationPayload === "object" &&
        "data" in registrationPayload &&
        Array.isArray(registrationPayload.data)
      ? registrationPayload.data
      : []
  const eventResponse = eventQuery.data as unknown as
    | { data?: EventPublic }
    | EventPublic
    | undefined
  const event =
    eventResponse && "event_name" in eventResponse
      ? eventResponse
      : eventResponse?.data
  useEffect(() => {
    if (!eventQuery.isSuccess || hydratedEventRef.current === eventId) return
    autoSaveReadyRef.current = false
    setSelectedSections(event?.eligible_section_ids ?? [])
    hydratedEventRef.current = eventId
  }, [eventId, eventQuery.isSuccess, event?.eligible_section_ids])
  const studentQueries = useQuery({
    queryKey: ["registrationStudents", selectedSections],
    enabled: selectedSections.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        selectedSections.map((sectionId) =>
          StudentsService.readStudents({
            query: { section_id: sectionId, skip: 0, limit: 1000 },
          }),
        ),
      )
      return results.flatMap((result) =>
        Array.isArray(result.data?.data) ? result.data.data : [],
      )
    },
  })
  const saveSectionsMutation = useMutation({
    mutationFn: (sectionIds: string[]) =>
      EventsService.updateEvent({
        path: { event_id: eventId },
        body: { eligible_section_ids: sectionIds },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["event", eventId] }),
  })
  useEffect(() => {
    if (hydratedEventRef.current !== eventId) return
    if (!autoSaveReadyRef.current) {
      autoSaveReadyRef.current = true
      return
    }
    const timeout = window.setTimeout(() => {
      saveSectionsMutation.mutate(selectedSections)
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [eventId, selectedSections, saveSectionsMutation.mutate])
  const mutation = useMutation({
    mutationFn: async () => {
      await EventsService.updateEvent({
        path: { event_id: eventId },
        body: { eligible_section_ids: selectedSections },
      })
      const existing = new Set(registered.map((item) => item.attendee_id))
      const students = (studentQueries.data ?? []).filter(
        (student) => student.attendee_id && !existing.has(student.attendee_id),
      )
      for (const student of students)
        await EventRegistrationsService.registrationsCreateEventRegistration({
          body: {
            event_id: eventId,
            attendee_id: student.attendee_id!,
            registration_status: "registered",
          },
        })
      return students.length
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["eventRegistrations", eventId],
      })
      queryClient.invalidateQueries({ queryKey: ["event", eventId] })
    },
  })
  const students = studentQueries.data ?? []
  const sections = sectionsQuery.data?.data.data ?? []
  const registrySections = registrySectionsQuery.data?.data.data ?? []
  const registrySectionNames = new Map(
    registrySections.map((section) => {
      const programCode = section.program_code?.trim() ?? ""
      const majorCode = section.major_code?.trim() ?? ""
      const sectionCode =
        section.section_code?.trim() || section.section_name.trim()
      const prefix = [programCode, majorCode].filter(Boolean).join(" ")
      const alreadyFormatted =
        prefix.length > 0 &&
        (sectionCode.toLocaleUpperCase() === prefix.toLocaleUpperCase() ||
          sectionCode
            .toLocaleUpperCase()
            .startsWith(`${prefix.toLocaleUpperCase()} `))
      return [
        section.id,
        alreadyFormatted || !prefix ? sectionCode : `${prefix} ${sectionCode}`,
      ]
    }),
  )
  const allSectionsSelected =
    sections.length > 0 &&
    sections.every((section) => selectedSections.includes(section.id))
  const toggleSectionGroup = (sectionIds: string[]) => {
    setSelectedSections((current) => {
      const allSelected =
        sectionIds.length > 0 && sectionIds.every((id) => current.includes(id))
      return allSelected
        ? current.filter((id) => !sectionIds.includes(id))
        : [...new Set([...current, ...sectionIds])]
    })
  }
  const eligibleCount = useMemo(
    () => students.filter((student) => student.attendee_id).length,
    [students],
  )
  const missing = Math.max(
    0,
    eligibleCount -
      students.filter(
        (student) =>
          student.attendee_id &&
          registered.some((item) => item.attendee_id === student.attendee_id),
      ).length,
  )
  if (eventQuery.isLoading)
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Loading event…
        </CardContent>
      </Card>
    )
  if (eventQuery.isError)
    return (
      <Card>
        <CardContent className="space-y-3 py-12 text-center">
          <div role="alert">
            <p className="font-medium text-destructive">
              Unable to load event details.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => eventQuery.refetch()}
            >
              Retry loading event
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/events">
                <ArrowLeft />
                Back to events
              </Link>
            </Button>
          </div>
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
        <p className="mt-4 text-sm text-muted-foreground">Registration</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {event.event_name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select sections to define the expected student population.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eligible Sections</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sectionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading sections…</p>
          ) : sectionsQuery.isError ? (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">
                Unable to load eligible sections. Your current selections have
                not been changed.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => sectionsQuery.refetch()}
              >
                Retry loading sections
              </Button>
            </div>
          ) : sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No sections are available. Check the academic year and section
              setup.
            </p>
          ) : (
            <>
              <div className="rounded-lg border bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {selectedSections.length} of {sections.length} sections
                      selected
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Choose sections individually or use the year shortcuts.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setSelectedSections(
                        allSectionsSelected
                          ? []
                          : sections.map((section) => section.id),
                      )
                    }
                  >
                    {allSectionsSelected
                      ? "Clear selection"
                      : "Select all sections"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((year) => {
                  const yearSections = sections.filter(
                    (section) => getYearNumber(section.year_level) === year,
                  )
                  const allYearSelected =
                    yearSections.length > 0 &&
                    yearSections.every((section) =>
                      selectedSections.includes(section.id),
                    )
                  return (
                    <Button
                      key={year}
                      type="button"
                      size="sm"
                      variant={allYearSelected ? "default" : "outline"}
                      disabled={yearSections.length === 0}
                      onClick={() =>
                        toggleSectionGroup(
                          yearSections.map((section) => section.id),
                        )
                      }
                    >
                      {allYearSelected ? "Clear" : "Select"}{" "}
                      {year === 1
                        ? "1st"
                        : year === 2
                          ? "2nd"
                          : year === 3
                            ? "3rd"
                            : "4th"}{" "}
                      year
                    </Button>
                  )
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sections.map((section) => {
                  const checked = selectedSections.includes(section.id)
                  return (
                    <label
                      key={section.id}
                      className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50 ${checked ? "border-primary bg-primary/5" : "bg-background"}`}
                    >
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-primary"
                        checked={checked}
                        onChange={() => toggleSectionGroup([section.id])}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-medium">
                          {registrySectionNames.get(section.id) ??
                            section.section_name}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Year {section.year_level} · {section.academic_year}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            Registration Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {registrationQuery.isError && (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">
                Unable to load current registrations. The registration count may
                be incomplete.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => registrationQuery.refetch()}
              >
                Retry loading registrations
              </Button>
            </div>
          )}
          {selectedSections.length > 0 && studentQueries.isError && (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">
                Unable to load students for the selected sections.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => studentQueries.refetch()}
              >
                Retry loading students
              </Button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Registered"
              value={registrationQuery.isError ? "—" : registered.length}
            />
            <Stat
              label="Selected students"
              value={studentQueries.isError ? "—" : eligibleCount}
            />
            <Stat
              label="To add"
              value={
                registrationQuery.isError || studentQueries.isError
                  ? "—"
                  : missing
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                selectedSections.length === 0 ||
                eligibleCount === 0 ||
                mutation.isPending ||
                sectionsQuery.isLoading ||
                sectionsQuery.isError ||
                registrationQuery.isLoading ||
                registrationQuery.isError ||
                studentQueries.isLoading ||
                studentQueries.isError
              }
              onClick={() => mutation.mutate()}
            >
              <Check />
              {mutation.isPending
                ? "Registering…"
                : "Register selected sections"}
            </Button>
          </div>
          {saveSectionsMutation.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Saving eligible sections…
            </p>
          )}
          {saveSectionsMutation.isSuccess &&
            !saveSectionsMutation.isPending && (
              <p role="status" className="text-sm text-muted-foreground">
                Eligible sections saved automatically.
              </p>
            )}
          {saveSectionsMutation.isError && (
            <div className="space-y-2" role="alert">
              <p className="text-sm text-destructive">
                Could not save eligible sections.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => saveSectionsMutation.mutate(selectedSections)}
              >
                Retry saving sections
              </Button>
            </div>
          )}
          {mutation.isSuccess && (
            <p className="text-sm text-muted-foreground">
              Registration population updated.
            </p>
          )}
          {mutation.isError && (
            <p className="text-sm text-destructive">
              Some registrations could not be created. Refresh and retry.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link to="/events/$eventId/roster" params={{ eventId }}>
            Open Roster
          </Link>
        </Button>
      </div>
    </div>
  )
}
function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}
