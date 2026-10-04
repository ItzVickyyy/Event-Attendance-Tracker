import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { Footer } from "@/components/Common/Footer"
import { AcademicYearProvider, useAcademicYear } from "@/context/AcademicYearContext"
import { CalendarDays, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import useAuth from "@/hooks/useAuth"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import AppSidebar from "@/components/Sidebar/AppSidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async () => {
    if (!isLoggedIn()) throw redirect({ to: "/login" })
  },
})

function AcademicYearSelector() {
  const { academicYears, activeAcademicYear, currentAcademicYear, setActiveAcademicYearId, isLoading } = useAcademicYear()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear) throw new Error("Select an academic year first")
      const token = localStorage.getItem("access_token")
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/academic-registry/academic-years/${activeAcademicYear.id}/set-current`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.detail ?? "Unable to change the default academic year")
      }
      return response.json()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["academicYears", "global"] })
      void queryClient.invalidateQueries({ queryKey: ["academicYears", "section-registry"] })
    },
  })

  return (
    <div className="ml-auto flex items-center gap-2">
      <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
      <span className="hidden text-sm text-muted-foreground sm:inline">Academic Year</span>
      <Select
        value={activeAcademicYear?.id ?? ""}
        onValueChange={setActiveAcademicYearId}
        disabled={isLoading || academicYears.length === 0}
      >
        <SelectTrigger className="h-9 w-[125px]" aria-label="Academic Year">
          <SelectValue placeholder="Academic Year" />
        </SelectTrigger>
        <SelectContent>
          {academicYears.map((year) => (
            <SelectItem key={year.id} value={year.id}>{year.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {user?.role === "super_admin" && activeAcademicYear && activeAcademicYear.id !== currentAcademicYear?.id && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={`Make ${activeAcademicYear.label} the system default`}
          aria-label={`Make ${activeAcademicYear.label} the system default`}
          onClick={() => setDefaultMutation.mutate()}
          disabled={setDefaultMutation.isPending}
        >
          <Check className="size-4" />
        </Button>
      )}
    </div>
  )
}

function Layout() {
  return (
    <AcademicYearProvider>
      <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1 min-h-10 min-w-10" aria-label="Toggle navigation" />
          <div className="hidden truncate text-sm text-muted-foreground sm:block">Event Attendance Tracker</div>
          <AcademicYearSelector />
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl min-w-0"><Outlet /></div>
        </main>
        <Footer />
      </SidebarInset>
      </SidebarProvider>
    </AcademicYearProvider>
  )
}
