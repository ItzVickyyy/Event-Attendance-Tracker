import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, UserRound } from "lucide-react"
import { PeopleService, AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function StudentDetailsPage({ studentId }: { studentId: string }) {
  const studentQuery = useQuery({ queryKey: ["student", studentId], queryFn: () => StudentsService.readStudent({ path: { student_id: studentId } }) })
  const student = studentQuery.data?.data
  const personQuery = useQuery({ queryKey: ["person", student?.person_id], queryFn: () => PeopleService.readPerson({ path: { person_id: student!.person_id } }), enabled: Boolean(student?.person_id) })
  const sectionQuery = useQuery({ queryKey: ["academicSection", student?.section_id], queryFn: () => AcademicSectionsService.sectionsReadAcademicSection({ path: { section_id: student!.section_id! } }), enabled: Boolean(student?.section_id) })
  const programsQuery = useQuery({ queryKey: ["academicPrograms", "student-detail"], queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }), enabled: Boolean(student?.section_id) })
  const section = sectionQuery.data?.data
  const program = section ? programsQuery.data?.data.data.find((item) => item.id === section.program_id) : undefined

  if (studentQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading student…</CardContent></Card>
  if (studentQuery.isError || !student) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Student not found.</p><p className="mt-1 text-sm text-muted-foreground">The requested student could not be loaded.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections"><ArrowLeft />Back to sections</Link></Button></CardContent></Card>

  const person = personQuery.data?.data
  const fullName = person ? [person.first_name, person.middle_name, person.last_name, person.name_extension].filter(Boolean).join(" ") : student.person_name ?? "Unknown"

  return <div className="space-y-6">
    <div><Button variant="ghost" size="sm" asChild><Link to="/sections"><ArrowLeft />Sections & Students</Link></Button><div className="mt-4 flex items-start gap-3"><div className="rounded-lg border p-2"><UserRound className="size-5 text-muted-foreground" /></div><div><p className="text-sm text-muted-foreground">Student</p><h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1><p className="mt-1 text-sm text-muted-foreground">{student.student_number}</p></div></div></div>
    <Card><CardHeader><CardTitle className="text-base">Student Information</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info label="Full name" value={fullName} /><Info label="Student number" value={student.student_number} /><Info label="Academic status" value={student.academic_status ? String(student.academic_status) : "—"} /><Info label="Program" value={program ? `${program.program_code} · ${program.program_name}` : "—"} /><Info label="Year level" value={section?.year_level ?? "—"} /><Info label="Section" value={section?.section_name ?? "—"} /><Info label="Academic year" value={section?.academic_year ?? "—"} /></CardContent></Card>
    {student.section_id && <Button variant="outline" asChild><Link to="/sections/$sectionId" params={{ sectionId: student.section_id }}>View Section</Link></Button>}
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div> }
