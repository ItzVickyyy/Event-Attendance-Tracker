import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import {
  Activity,
  ArrowRight,
  ClipboardCheck,
  KeyRound,
  Users,
  UserRoundCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { AttendanceCorrectionsService, UsersService } from "@/client"
import useAuth from "@/hooks/useAuth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type AdministrationSection = {
  to: string
  title: string
  description: string
  detail: string
  icon: LucideIcon
  superAdminOnly?: boolean
  superAdminOrDeveloper?: boolean
}

const sections: AdministrationSection[] = [
  {
    to: "/administration/users",
    title: "User Accounts",
    description: "Create accounts, update roles, and manage account access.",
    detail: "Accounts and access",
    icon: Users,
  },
  {
    to: "/administration/class-representatives",
    title: "Class Representatives",
    description: "Assign representatives to the correct section and academic year.",
    detail: "Section assignments",
    icon: UserRoundCheck,
    superAdminOnly: true,
  },
  {
    to: "/administration/attendance",
    title: "Attendance Corrections",
    description: "Review attendance corrections and their recorded reasons.",
    detail: "Attendance oversight",
    icon: ClipboardCheck,
  },
  {
    to: "/administration/scanner-permissions",
    title: "Scanner Permissions",
    description: "Review who is allowed to scan attendance.",
    detail: "Scanner access",
    icon: KeyRound,
    superAdminOnly: true,
  },
  {
    to: "/administration/audit-logs",
    title: "Audit Logs",
    description: "Review available system activity and audit records.",
    detail: "Activity history",
    icon: Activity,
    superAdminOrDeveloper: true,
  },
]

function MetricCard({
  title,
  value,
  description,
  loading,
  error,
  icon: Icon,
}: {
  title: string
  value: number | undefined
  description: string
  loading: boolean
  error: boolean
  icon: typeof Users
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {loading ? "—" : error ? "!" : (value ?? 0).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {error ? "Could not load this summary." : description}
          </p>
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  )
}

export function AdministrationWorkspace() {
  const { user } = useAuth()
  const isSuperAdmin = Boolean(user?.is_superuser || user?.role === "super_admin")
  const sectionsToShow = sections.filter((section) => {
    if (section.superAdminOnly && !isSuperAdmin) return false
    if (section.superAdminOrDeveloper && !isSuperAdmin && !user?.is_developer) return false
    return true
  })
  const users = useQuery({
    queryKey: ["admin-users-summary"],
    queryFn: () => UsersService.readUsers({ query: { skip: 0, limit: 1 } }),
  })
  const corrections = useQuery({
    queryKey: ["admin-corrections-summary"],
    queryFn: () =>
      AttendanceCorrectionsService.correctionsReadAttendanceCorrections({
        query: { skip: 0, limit: 1 },
      }),
  })

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Workspace / Administration</p>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Administration</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage accounts, access, attendance oversight, and system activity from one place.
          </p>
        </div>
      </header>

      <section aria-label="Administration summary" className="grid gap-4 sm:grid-cols-2">
        <MetricCard
          title="User Accounts"
          value={users.data?.data.count}
          description="Accounts in the system"
          loading={users.isLoading}
          error={users.isError}
          icon={Users}
        />
        <MetricCard
          title="Attendance Corrections"
          value={corrections.data?.data.count}
          description="Recorded correction requests"
          loading={corrections.isLoading}
          error={corrections.isError}
          icon={ClipboardCheck}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Administration tools</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a workspace to manage a specific part of the system.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sectionsToShow.map(({ to, title, description, detail, icon: Icon }) => (
            <Link key={to} to={to} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
                <CardHeader className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl border bg-background p-3">
                      <Icon aria-hidden="true" className="size-5" />
                    </div>
                    <ArrowRight aria-hidden="true" className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{detail}</p>
                    <CardTitle className="text-base">{title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-6">{description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
