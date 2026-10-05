import { Outlet, createFileRoute, redirect, useLocation, useNavigate } from "@tanstack/react-router"
import { Footer } from "@/components/Common/Footer"
import { AcademicYearProvider, useAcademicYear } from "@/context/AcademicYearContext"
import { CalendarDays, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import useAuth from "@/hooks/useAuth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  const {
    academicYears,
    activeAcademicYear,
    currentAcademicYear,
    setActiveAcademicYearId,
    isLoading,
  } = useAcademicYear()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const setDefaultMutation = useMutation({
    mutationFn: async () => {
      if (!activeAcademicYear) throw new Error("Select an academic year first")
      const token = localStorage.getItem("access_token")
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/api/v1/academic-registry/academic-years/${activeAcademicYear.id}/set-current`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      )
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
    <div className="ml-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-10 min-w-10"
            aria-label={activeAcademicYear ? `Academic Year: ${activeAcademicYear.label}` : "Academic Year"}
            title={activeAcademicYear ? `Academic Year: ${activeAcademicYear.label}` : "Academic Year"}
            disabled={isLoading || academicYears.length === 0}
          >
            <CalendarDays className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Academic Year</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={activeAcademicYear?.id ?? ""}
            onValueChange={user?.role === "class_representative" ? undefined : setActiveAcademicYearId}
          >
            {academicYears.map((year) => (
              <DropdownMenuRadioItem key={year.id} value={year.id}>
                {year.label}
                {year.id === currentAcademicYear?.id && (
                  <span className="ml-auto text-xs text-muted-foreground">Default</span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {user?.role === "super_admin" &&
            activeAcademicYear &&
            activeAcademicYear.id !== currentAcademicYear?.id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={setDefaultMutation.isPending}
                  onSelect={(event) => {
                    event.preventDefault()
                    setDefaultMutation.mutate()
                  }}
                >
                  <Check className="size-4" />
                  Make {activeAcademicYear.label} default
                </DropdownMenuItem>
              </>
            )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
function Layout() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const mustChangePassword = Boolean((user as any)?.must_change_password)

  useEffect(() => {
    if (mustChangePassword && location.pathname !== "/account") {
      void navigate({ to: "/account", replace: true })
    }
  }, [mustChangePassword, location.pathname, navigate])

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
