import { useSuspenseQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { Suspense, useMemo, useState } from "react"
import type { PersonPublic } from "@/client"
import { PeopleService, StudentsService } from "@/client"
import { DataTable } from "@/components/Common/DataTable"
import PendingStudents from "@/components/Pending/PendingStudents"
import AddStudent from "@/components/Students/AddStudent"
import type { StudentTableRow } from "@/components/Students/columns"
import { studentsColumns } from "@/components/Students/columns"

function getStudentsQueryOptions(search: string) {
  return {
    queryFn: async () =>
      (
        await StudentsService.readStudents({
          query: { skip: 0, limit: 1000, search: search || undefined },
        })
      ).data,
    queryKey: ["students", search],
  }
}

function getPeopleQueryOptions() {
  return {
    queryFn: async () =>
      (await PeopleService.readPeople({ query: { skip: 0, limit: 10000 } }))
        .data,
    queryKey: ["people"] as const,
  }
}

export const Route = createFileRoute("/_layout/students")({
  component: Students,
  head: () => ({ meta: [{ title: "Students - Event Attendance Tracker" }] }),
})

function StudentsTableContent({ search }: { search: string }) {
  const { data: students } = useSuspenseQuery(getStudentsQueryOptions(search))
  const { data: people } = useSuspenseQuery(getPeopleQueryOptions())

  const rows: StudentTableRow[] = useMemo(() => {
    const map = new Map<string, PersonPublic>(people.data.map((p) => [p.id, p]))
    return students.data.map((s) => ({
      ...s,
      person: map.get(s.person_id) ?? null,
    }))
  }, [students, people])

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold">No students found</h3>
        <p className="text-muted-foreground">
          {search
            ? "Try a different search term"
            : "Add a new student to get started"}
        </p>
      </div>
    )
  }

  return <DataTable columns={studentsColumns} data={rows} />
}

function Students() {
  const [search, setSearch] = useState("")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="text-muted-foreground">
            Manage student records and NFC registrations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AddStudent />
        </div>
      </div>
      <form
        className="flex-1 max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.currentTarget)
          setSearch((formData.get("search") as string) || "")
        }}
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="search"
            type="search"
            placeholder="Search by name, student number, or NFC UID..."
            className="flex h-10 w-full rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </form>
      <Suspense fallback={<PendingStudents />}>
        <StudentsTableContent search={search} />
      </Suspense>
    </div>
  )
}

export default Students
