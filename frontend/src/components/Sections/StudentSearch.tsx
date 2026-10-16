import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { AcademicRegistryService, StudentsService } from "@/client"
import { STUDENT_SEARCH_PAGE_SIZE } from "@/lib/studentPagination"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const PAGE_SIZE = STUDENT_SEARCH_PAGE_SIZE
const SEARCH_STATE_KEY = "section-students-global-search"

function readSavedSearchState(): {
  search: string
  submitted: string
  page: number
} {
  if (typeof window === "undefined") {
    return { search: "", submitted: "", page: 0 }
  }
  try {
    const saved = sessionStorage.getItem(SEARCH_STATE_KEY)
    if (!saved) return { search: "", submitted: "", page: 0 }
    const parsed = JSON.parse(saved)
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      submitted: typeof parsed.submitted === "string" ? parsed.submitted : "",
      page: Number.isInteger(parsed.page) && parsed.page >= 0 ? parsed.page : 0,
    }
  } catch {
    return { search: "", submitted: "", page: 0 }
  }
}

export function StudentSearch() {
  const [initialState] = useState(readSavedSearchState)
  const [search, setSearch] = useState(initialState.search)
  const [submitted, setSubmitted] = useState(initialState.submitted)
  const [page, setPage] = useState(initialState.page)
  const lastSubmittedRef = useRef(initialState.submitted)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextSearch = search.trim()
      if (nextSearch !== lastSubmittedRef.current) {
        lastSubmittedRef.current = nextSearch
        setSubmitted(nextSearch)
        setPage(0)
      }
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  useEffect(() => {
    sessionStorage.setItem(
      SEARCH_STATE_KEY,
      JSON.stringify({ search, submitted, page }),
    )
  }, [search, submitted, page])

  const query = useQuery({
    queryKey: ["students", "global-search", submitted, page],
    queryFn: () =>
      StudentsService.readStudents({
        query: { search: submitted, skip: page * PAGE_SIZE, limit: PAGE_SIZE },
      }),
    enabled: submitted.trim().length > 0,
  })
  const sectionsQuery = useQuery({
    queryKey: ["academicRegistrySections", "student-search"],
    queryFn: () => AcademicRegistryService.registryReadSections(),
    enabled: submitted.trim().length > 0,
  })

  const students = query.data?.data.data ?? []
  const count = query.data?.data.count ?? 0
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const sections = sectionsQuery.data?.data.data ?? []
  const sectionNames = new Map(
    sections.map((section) => {
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

  return (
    <Card>
      <CardContent className="space-y-4">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by student number or full name"
          aria-label="Search students"
        />
        {query.isLoading && (
          <p className="text-sm text-muted-foreground">Searching…</p>
        )}
        {query.isError && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Unable to search students.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {!query.isLoading &&
          !query.isError &&
          submitted &&
          students.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No students match your search.
            </p>
          )}
        {students.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Section</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium">
                    {student.student_number}
                  </TableCell>
                  <TableCell>{student.person_name ?? "Unknown"}</TableCell>
                  <TableCell>
                    {student.academic_status
                      ? String(student.academic_status)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {student.section_id ? (
                      <Link
                        className="underline underline-offset-4"
                        to="/sections/$sectionId"
                        params={{ sectionId: student.section_id }}
                      >
                        {sectionNames.get(student.section_id) ??
                          (sectionsQuery.isLoading
                            ? "Loading section…"
                            : "Section unavailable")}
                      </Link>
                    ) : (
                      "No section assigned"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {student.section_id ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link
                          to="/sections/$sectionId/students/$studentId"
                          params={{
                            sectionId: student.section_id,
                            studentId: student.id,
                          }}
                          search={{ from: "search" }}
                        >
                          View details
                        </Link>
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No section
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {query.data && count > 0 && (
          <div className="flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, count)} of {count} matching
              students
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || query.isFetching}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous
              </Button>
              <span className="flex items-center px-2">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page + 1 >= totalPages || query.isFetching}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
