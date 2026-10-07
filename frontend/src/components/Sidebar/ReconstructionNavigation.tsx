import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ScanLine,
  Settings,
  Shield,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  Users,
  UsersRound,
} from "lucide-react"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"

type NavigationItem = {
  title: string
  path: string
  icon: LucideIcon
  adminOnly?: boolean
  developerOnly?: boolean
}
type NavigationGroup = { title: string; items: NavigationItem[] }

const navigationGroups: NavigationGroup[] = [
  {
    title: "Workspace",
    items: [{ title: "Dashboard", path: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Developer",
    items: [
      {
        title: "System Dashboard",
        path: "/developer",
        icon: Gauge,
        developerOnly: true,
      },
    ],
  },
  {
    title: "Operations",
    items: [
      { title: "Events", path: "/events", icon: CalendarDays },
      { title: "Students", path: "/sections", icon: UsersRound },
      { title: "Records", path: "/records", icon: ClipboardList },
      { title: "Scanner", path: "/scanner", icon: ScanLine },
    ],
  },
  {
    title: "Administration",
    items: [
      { title: "Overview", path: "/administration", icon: ShieldCheck },
      { title: "User Accounts", path: "/administration/users", icon: Users },
      {
        title: "Class Representatives",
        path: "/administration/class-representatives",
        icon: UserRoundCheck,
        adminOnly: true,
      },
      { title: "Roles & Permissions", path: "/administration/roles", icon: Shield },
      {
        title: "Attendance Corrections",
        path: "/administration/attendance",
        icon: ClipboardCheck,
      },
      {
        title: "Scanner Permissions",
        path: "/administration/scanner-permissions",
        icon: KeyRound,
      },
      { title: "Audit Logs", path: "/administration/audit-logs", icon: Activity },
      { title: "System Settings", path: "/settings", icon: Settings },
    ],
  },
  {
    title: "Account",
    items: [{ title: "My Account", path: "/account", icon: UserRound }],
  },
]

function canSeeOperationalNavigation(role?: string, isSuperuser?: boolean) {
  return (
    isSuperuser ||
    role === "admin" ||
    role === "super_admin" ||
    role === "class_representative"
  )
}

function canSeeAdministration(role?: string, isSuperuser?: boolean) {
  return isSuperuser || role === "admin" || role === "super_admin"
}

export function ReconstructionNavigation() {
  const { user } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const role = user?.role
  const isSuperuser = Boolean(user?.is_superuser)
  const developerOnly = String(role) === "developer"
  const scannerAllowed = Boolean(
    isSuperuser ||
      role === "admin" ||
      role === "super_admin" ||
      user?.can_scan,
  )
  const operationalAllowed = canSeeOperationalNavigation(role, isSuperuser)
  const administrationAllowed = canSeeAdministration(role, isSuperuser)
  const canManageClassRepresentatives = Boolean(
    isSuperuser || role === "super_admin",
  )
  const classRep = role === "class_representative" && !isSuperuser

  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (developerOnly) return Boolean(item.developerOnly || item.path === "/account")
        if (item.developerOnly) return Boolean(user?.is_developer || String(role) === "developer")
        if (item.path.startsWith("/administration")) {
          if (!administrationAllowed) return false
          if (item.adminOnly && !canManageClassRepresentatives) return false
          return true
        }
        if (item.path === "/settings") return administrationAllowed
        if (item.path === "/scanner") return scannerAllowed && !classRep
        if (classRep && item.path === "/events") return false
        if (
          item.path === "/events" ||
          item.path === "/records" ||
          item.path === "/sections"
        ) {
          return operationalAllowed
        }
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <nav aria-label="Primary navigation" className="space-y-1">
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive =
                  item.path === "/administration"
                    ? pathname === item.path
                    : pathname === item.path ||
                      pathname.startsWith(`${item.path}/`)
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className="min-h-10"
                    >
                      <RouterLink
                        to={item.path}
                        onClick={() => isMobile && setOpenMobile(false)}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </RouterLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  )
}
