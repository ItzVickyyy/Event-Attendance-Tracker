import { createFileRoute } from "@tanstack/react-router"
import SectionList from "@/components/Sections/SectionList"
import { StudentSearch } from "@/components/Sections/StudentSearch"
import { ClassRepresentativeSectionWorkspace } from "@/components/ClassRepresentative/SectionWorkspace"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/sections")({
  component: Sections,
  head: () => ({ meta: [{ title: "Students - Event Attendance Tracker" }] }),
})

function Sections() {
  const { user } = useAuth()
  if (user?.role === "class_representative") return <ClassRepresentativeSectionWorkspace />
  return <div className="space-y-8"><header className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Students</p><h1 className="text-3xl font-semibold tracking-tight">Students</h1><p className="max-w-2xl text-muted-foreground">Browse academic sections and search for students across the selected academic year.</p></header><StudentSearch /><SectionList /></div>
}
