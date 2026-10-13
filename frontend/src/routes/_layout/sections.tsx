import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"
import { ClassRepresentativeSectionWorkspace } from "@/components/ClassRepresentative/SectionWorkspace"
import SectionList from "@/components/Sections/SectionList"
import { StudentSearch } from "@/components/Sections/StudentSearch"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/sections")({
  component: Sections,
  head: () => ({ meta: [{ title: "Students - Event Attendance Tracker" }] }),
})

function Sections() {
  const { user } = useAuth()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  if (user?.role === "class_representative")
    return <ClassRepresentativeSectionWorkspace />
  if (pathname !== "/sections") return <Outlet />

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Students</p>
        <h1 className="text-3xl font-semibold tracking-tight">Students</h1>
        <p className="max-w-2xl text-muted-foreground">
          Browse sections and manage student enrollments for the selected
          academic year.
        </p>
      </header>
      <StudentSearch />
      <SectionList />
    </div>
  )
}
