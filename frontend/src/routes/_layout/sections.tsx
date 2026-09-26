import { createFileRoute } from "@tanstack/react-router"
import SectionList from "@/components/Sections/SectionList"
import { StudentSearch } from "@/components/Sections/StudentSearch"

export const Route = createFileRoute("/_layout/sections")({
  component: Sections,
  head: () => ({ meta: [{ title: "Sections & Students - Event Attendance Tracker" }] }),
})

function Sections() {
  return <div className="space-y-8"><header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Sections & Students</p><h1 className="text-3xl font-semibold tracking-tight">Sections</h1><p className="max-w-2xl text-muted-foreground">Browse academic sections and the students assigned to them. Use global search when you already know a student.</p></header><SectionList /><StudentSearch /></div>
}
