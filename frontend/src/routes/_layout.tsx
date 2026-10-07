import { Outlet, createFileRoute, redirect } from "@tanstack/react-router"
import { UsersService } from "@/client"
import { Footer } from "@/components/Common/Footer"
import { AcademicYearProvider, useAcademicYear } from "@/context/AcademicYearContext"
import { CalendarDays, Check, Eye, EyeOff, KeyRound, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "sonner"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout")({
  component: Layout,
  beforeLoad: async ({ location }) => {
    if (!isLoggedIn()) throw redirect({ to: "/login" })

    const { data: user } = await UsersService.readUserMe()
    const path = location.pathname
    const isSuperAdmin = Boolean(user.is_superuser || user.role === "super_admin")
    const isAdmin = isSuperAdmin || user.role === "admin"
    const isDeveloper = Boolean(user.is_developer)

    if (
      path.startsWith("/administration") &&
      !isAdmin &&
      !(path.startsWith("/administration/audit-logs") && isDeveloper)
    ) {
      throw redirect({ to: "/dashboard" })
    }

    const superAdminOnlyPath =
      path.startsWith("/administration/class-representatives") ||
      path.startsWith("/administration/scanner-permissions") ||
      path.startsWith("/settings")

    if (superAdminOnlyPath && !isSuperAdmin) {
      throw redirect({ to: "/dashboard" })
    }

    if (
      path.startsWith("/administration/audit-logs") &&
      !isSuperAdmin &&
      !isDeveloper
    ) {
      throw redirect({ to: "/dashboard" })
    }

    const isIsolatedDeveloper = isDeveloper && !isAdmin
    const allowedDeveloperPath =
      path.startsWith("/developer") ||
      path.startsWith("/account") ||
      path.startsWith("/administration/audit-logs")

    if (isIsolatedDeveloper && !allowedDeveloperPath) {
      throw redirect({ to: "/developer" })
    }
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
  const queryClient = useQueryClient()
  const mustChangePassword = Boolean((user as any)?.must_change_password)

  const [passwordModalOpen, setPasswordModalOpen] = useState(mustChangePassword)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    if (mustChangePassword) setPasswordModalOpen(true)
  }, [mustChangePassword])

  const updateInitialPassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please complete all password fields")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match")
      return
    }
    if (currentPassword === newPassword) {
      toast.error("New password must be different from the temporary password")
      return
    }
    setChangingPassword(true)
    try {
      const response = await fetch("/api/v1/users/me/password", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + localStorage.getItem("access_token"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(body?.detail ?? "Unable to change password")
        return
      }
      setPasswordModalOpen(false)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Password updated successfully")
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <AcademicYearProvider>
      <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4">
          <SidebarTrigger className="-ml-1 min-h-10 min-w-10" aria-label="Toggle navigation" />
          <div className="hidden truncate text-sm text-muted-foreground sm:block">Event Attendance Tracker</div>
          {user?.role !== "class_representative" && !(user?.role === "developer" && !user.is_superuser) && <AcademicYearSelector />}
        </header>
        <main className="min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl min-w-0"><Outlet /></div>
        </main>
        <Dialog open={passwordModalOpen} onOpenChange={(open) => {
          if (!mustChangePassword) setPasswordModalOpen(open)
        }}>
          <DialogContent showCloseButton={!mustChangePassword} onEscapeKeyDown={(event) => {
            if (mustChangePassword) event.preventDefault()
          }} onPointerDownOutside={(event) => {
            if (mustChangePassword) event.preventDefault()
          }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-5" />
                Update Your Password
              </DialogTitle>
              <DialogDescription>
                Your account was created with a temporary password. Please update it before continuing to use your account.
              </DialogDescription>
            </DialogHeader>

            <Alert>
              <ShieldAlert className="size-4" />
              <AlertTitle>Action required</AlertTitle>
              <AlertDescription>
                You are already on your Dashboard. You can review the page behind this notice, but your new password must be saved before you continue using the system.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="initial-current-password">Temporary password</Label>
                <div className="relative">
                  <Input
                    id="initial-current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="Enter your temporary password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    aria-label={showCurrentPassword ? "Hide temporary password" : "Show temporary password"}
                    title={showCurrentPassword ? "Hide password" : "Show password"}
                  >
                    {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-new-password">New password</Label>
                <div className="relative">
                  <Input
                    id="initial-new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Create a new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    title={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="initial-confirm-password">Confirm new password</Label>
                <div className="relative">
                  <Input
                    id="initial-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide confirm new password" : "Show confirm new password"}
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>            </div>

            <DialogFooter>
              <Button type="button" onClick={() => void updateInitialPassword()} disabled={changingPassword}>
                {changingPassword ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Footer />
      </SidebarInset>
      </SidebarProvider>
    </AcademicYearProvider>
  )
}
