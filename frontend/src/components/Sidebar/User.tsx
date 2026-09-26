import { Link as RouterLink } from "@tanstack/react-router"
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { getInitials } from "@/utils"

function UserInfo({ fullName, email }: { fullName?: string; email?: string }) {
  return (
    <div className="flex w-full min-w-0 items-center gap-2.5">
      <Avatar className="size-8"><AvatarFallback>{getInitials(fullName || "User")}</AvatarFallback></Avatar>
      <div className="flex min-w-0 flex-col items-start">
        <p className="w-full truncate text-sm font-medium">{fullName}</p>
        <p className="w-full truncate text-xs text-muted-foreground">{email}</p>
      </div>
    </div>
  )
}

export function User({ user }: { user: any }) {
  const { logout } = useAuth()
  const { isMobile, setOpenMobile } = useSidebar()
  if (!user) return null

  const closeMobile = () => isMobile && setOpenMobile(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" data-testid="user-menu">
              <UserInfo fullName={user.full_name} email={user.email} />
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal"><UserInfo fullName={user.full_name} email={user.email} /></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <RouterLink to="/account" onClick={closeMobile}>
              <DropdownMenuItem><UserRound />My Account</DropdownMenuItem>
            </RouterLink>
            <DropdownMenuItem onClick={logout}><LogOut />Log Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
