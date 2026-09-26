import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, UsersRound } from "lucide-react"
import { AcademicProgramsService, AcademicSectionsService, StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function SectionDetailsPage({ sectionId }: { sectionId: string }) {
  const sectionQuery = useQuery({ queryKey: ["academicSection", sectionId], queryFn: () => AcademicSectionsService.sectionsReadAcademicSection({ path: { section_id: sectionId } }) })
  const programsQuery = useQuery({ queryKey: ["academicPrograms", "section-detail"], queryFn: () => AcademicProgramsService.programsReadAcademicPrograms({ query: { skip: 0, limit: 100 } }) })
  const studentsQuery = useQuery({ queryKey: ["students", "section", sectionId, "summary"], queryFn: () => StudentsService.readStudents({ query: { section_id: sectionId, skip: 0, limit: 1 } }) })
  const section = sectionQuery.data?.data
  const program = section ? programsQuery.data?.data.data.find((item) => item.id === section.program_id) : undefined
  const count = studentsQuery.data?.data.count

  if (sectionQuery.isLoading) return <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Loading section…</CardContent></Card>
  if (sectionQuery.isError || !section) return <Card><CardContent className="py-12 text-center"><p className="font-medium">Section not found.</p><p className="mt-1 text-sm text-muted-foreground">The requested academic section could not be loaded.</p><Button className="mt-4" variant="outline" asChild><Link to="/sections"><ArrowLeft />Back to sections</Link></Button></CardContent></Card>

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><Button variant="ghost" size="sm" asChild><Link to="/sections"><ArrowLeft />Sections</Link></Button><div className="mt-3"><p className="text-sm text-muted-foreground">Section Details</p><h1 className="text-2xl font-semibold tracking-tight">{section.section_name}</h1><p className="mt-1 text-sm text-muted-foreground">{program ? `${program.program_code} · ${program.program_name}` : "Program unavailable"} · Year {section.year_level} · {section.academic_year}</p></div></div>
    </header>

    <Card><CardHeader><CardTitle className="text-base">Section Information</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Info label="Section" value={section.section_name} /><Info label="Program" value={program ? `${program.program_code} · ${program.program_name}` : "—"} /><Info label="Year level" value={section.year_level} /><Info label="Academic year" value={section.academic_year} /></CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4" />Students</CardTitle></CardHeader><CardContent><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">Students assigned to this section</p><p className="text-sm text-muted-foreground">{count === undefined ? "Loading count…" : `${count} student${count === 1 ? "" : "s"}`}</p></div><Button asChild><Link to="/sections/$sectionId/students" params={{ sectionId }}>View students</Link></Button></div></CardContent></Card>
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div> }
