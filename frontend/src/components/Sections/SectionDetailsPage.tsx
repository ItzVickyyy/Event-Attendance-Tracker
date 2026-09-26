import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, UsersRound } from "lucide-react"
import { AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const PAGE_SIZE = 25

export function SectionDetailsPage({ sectionId }: { sectionId: string }) {
  const sectionQuery = useQuery({ queryKey: ["academicSection", sectionId], queryFn: () => AcademicSectionsService.sectionsReadAcademicSection({ path: { section_id: sectionId } }) })
  const programsQuery = useQuery({ queryKey: ["academicPrograms", "section-detail"], queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }) })
  const studentsQuery = useQuery({ queryKey: ["students", "section", sectionId], queryFn: () => StudentsService.readStudents({ query: { section_id: sectionId, skip: 0, limit: PAGE_SIZE } }) })
  const section = sectionQuery.data?.data
  const program = section ? programsQuery.data?.data.data.find((item) => item.id === section.program_id) : undefined
  const students = studentsQuery.data?.data.data ?? []
  const count = studentsQuery.data?.data.count ?? 0

  if (sectionQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading section…</CardContent></Card>
  if (sectionQuery.isError || !section) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Section not found.</p><p className="mt-1 text-sm text-muted-foreground">The requested academic section could not be loaded.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections"><ArrowLeft />Back to sections</Link></Button></CardContent></Card>

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><Button variant="ghost" size="sm" asChild><Link to="/sections"><ArrowLeft />Sections</Link></Button><div className="mt-3"><p className="text-sm text-muted-foreground">Section</p><h1 className="text-2xl font-semibold tracking-tight">{section.section_name}</h1><p className="mt-1 text-sm text-muted-foreground">{program ? `${program.program_code} · ${program.program_name}` : "Program unavailable"} · Year {section.year_level} · {section.academic_year}</p></div></div>
      <Button variant="outline" asChild><Link to="/records">Section attendance</Link></Button>
    </div>
    <Card><CardHeader><CardTitle className="text-base">Section Information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label="Section" value={section.section_name} /><Info label="Program" value={program?.program_code ?? "—"} /><Info label="Year level" value={section.year_level} /><Info label="Academic year" value={section.academic_year} /></CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4" />Students</CardTitle></CardHeader><CardContent className="space-y-4">{studentsQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading students…</p> : studentsQuery.isError ? <div><p className="font-medium">Unable to load students.</p><Button className="mt-3" variant="outline" size="sm" onClick={() => studentsQuery.refetch()}>Retry</Button></div> : students.length === 0 ? <p className="text-sm text-muted-foreground">No students are assigned to this section.</p> : <Table><TableHeader><TableRow><TableHead>Student Number</TableHead><TableHead>Name</TableHead><TableHead>Academic Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>{students.map((student) => <TableRow key={student.id}><TableCell className="font-medium">{student.student_number}</TableCell><TableCell>{student.person_name ?? "Unknown"}</TableCell><TableCell>{student.academic_status ? String(student.academic_status) : "—"}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" asChild><Link to="/students/$studentId" params={{ studentId: student.id }}>View</Link></Button></TableCell></TableRow>)}</TableBody></Table>}{count > PAGE_SIZE && <p className="text-xs text-muted-foreground">Showing the first {PAGE_SIZE} of {count} students. Full pagination can be refined in a later student workspace pass.</p>}</CardContent></Card>
    <Card className="border-dashed"><CardHeader><CardTitle className="text-base">Section Attendance</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">The current attendance API is event- and registration-based. This section provides the Records entry point without introducing section-specific attendance logic.</p><Button className="mt-4" variant="outline" asChild><Link to="/records">Open Records</Link></Button></CardContent></Card>
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div> }
