import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, UsersRound } from "lucide-react"
import { useState } from "react"
import { AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 25

export function SectionStudentsPage({ sectionId }: { sectionId: string }) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")

  const sectionQuery = useQuery({
    queryKey: ["academicSection", sectionId],
    queryFn: () => AcademicSectionsService.sectionsReadAcademicSection({ path: { section_id: sectionId } }),
  })
  const programsQuery = useQuery({
    queryKey: ["academicPrograms", "section-students"],
    queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }),
  })
  const studentsQuery = useQuery({
    queryKey: ["students", "section", sectionId, page],
    queryFn: () => StudentsService.readStudents({ query: { section_id: sectionId, skip: page * PAGE_SIZE, limit: PAGE_SIZE } }),
  })

  const section = sectionQuery.data?.data
  const program = section ? programsQuery.data?.data.data.find((item) => item.id === section.program_id) : undefined
  const students = studentsQuery.data?.data.data ?? []
  const count = studentsQuery.data?.data.count ?? 0
  const term = search.trim().toLowerCase()
  const filteredStudents = term
    ? students.filter((student) => `${student.student_number} ${student.person_name ?? ""}`.toLowerCase().includes(term))
    : students
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  if (sectionQuery.isLoading) {
    return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading section…</CardContent></Card>
  }

  if (sectionQuery.isError || !section) {
    return <Card><CardContent className="py-12 text-center"><p className="font-medium">Section not found.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections"><ArrowLeft />Back to sections</Link></Button></CardContent></Card>
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Button variant="ghost" size="sm" asChild><Link to="/sections/$sectionId" params={{ sectionId }}><ArrowLeft />Section Details</Link></Button>
        <div>
          <p className="text-sm text-muted-foreground">Students</p>
          <h1 className="text-2xl font-semibold tracking-tight">{section.section_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{program ? `${program.program_code} · ${program.program_name}` : "Program unavailable"} · Year {section.year_level} · {section.academic_year}</p>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4" />Students in this section</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter this section by student number or name" aria-label="Filter students in section" />
          {studentsQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading students…</p> : studentsQuery.isError ? <div className="py-8 text-center"><p className="font-medium">Unable to load students.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => studentsQuery.refetch()}>Retry</Button></div> : filteredStudents.length === 0 ? <div className="py-8 text-center"><p className="font-medium">No students found.</p><p className="mt-1 text-sm text-muted-foreground">Try a different filter.</p></div> : <Table><TableHeader><TableRow><TableHead>Student Number</TableHead><TableHead>Name</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{filteredStudents.map((student) => <TableRow key={student.id}><TableCell className="font-medium">{student.student_number}</TableCell><TableCell>{student.person_name ?? "Unknown"}</TableCell><TableCell>{student.academic_status ? String(student.academic_status) : "—"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link to="/sections/$sectionId/students/$studentId" params={{ sectionId, studentId: student.id }}>View</Link></Button></TableCell></TableRow>)}</TableBody></Table>}
          <div className="flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{count} student{count === 1 ? "" : "s"}</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
