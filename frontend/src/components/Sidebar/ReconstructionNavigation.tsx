import { CalendarDays, ClipboardList, LayoutDashboard, ScanLine, Settings, ShieldCheck, UserRound, UsersRound } from "lucide-react"
import { Link as RouterLink, useRouterState } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"

import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"

type NavigationItem = { title: string; path: string; icon: LucideIcon }
type NavigationGroup = { title: string; items: NavigationItem[] }

const navigationGroups: NavigationGroup[] = [
  { title: "Workspace", items: [{ title: "Dashboard", path: "/dashboard", icon: LayoutDashboard }] },
  { title: "Operations", items: [
    { title: "Events", path: "/events", icon: CalendarDays },
    { title: "Sections & Students", path: "/sections", icon: UsersRound },
    { title: "Records", path: "/records", icon: ClipboardList },
    { title: "Scanner", path: "/scanner", icon: ScanLine },
  ] },
  { title: "Administration", items: [
    { title: "Administration", path: "/administration", icon: ShieldCheck },
    { title: "System Settings", path: "/settings", icon: Settings },
  ] },
  { title: "Account", items: [{ title: "My Account", path: "/account", icon: UserRound }] },
]

function canSeeOperationalNavigation(role?: string, isSuperuser?: boolean) {
  return isSuperuser || role === "admin" || role === "super_admin" || role === "class_representative"
}

function canSeeAdministration(role?: string, isSuperuser?: boolean) {
  return isSuperuser || role === "admin" || role === "super_admin" || role === "developer"
}

export function ReconstructionNavigation() {
  const { user } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  const pathname = useRouterState({ select: (state) => state.location.pathname })

  const role = user?.role
  const isSuperuser = Boolean(user?.is_superuser)
  const scannerAllowed = Boolean(isSuperuser || role === "admin" || role === "super_admin" || role === "developer" || user?.can_scan)
  const operationalAllowed = canSeeOperationalNavigation(role, isSuperuser)
  const administrationAllowed = canSeeAdministration(role, isSuperuser)

  const groups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.path === "/administration" || item.path === "/settings") return administrationAllowed
        if (item.path === "/scanner") return scannerAllowed
        if (item.path === "/events" || item.path === "/records" || item.path === "/sections") return operationalAllowed
        return true
      }),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.title}>
          <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`)
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
                      <RouterLink to={item.path} onClick={() => isMobile && setOpenMobile(false)}>
                        <item.icon />
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
    </>
  )
}
