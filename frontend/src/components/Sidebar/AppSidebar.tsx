import { SidebarAppearance } from "@/components/Common/Appearance"
import { Logo } from "@/components/Common/Logo"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar"
import useAuth from "@/hooks/useAuth"
import { ReconstructionNavigation } from "./ReconstructionNavigation"
import { User } from "./User"

export function AppSidebar() {
  const { user } = useAuth()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-4 py-6 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:items-center">
        <Logo variant="responsive" />
      </SidebarHeader>
      <SidebarContent>
        <ReconstructionNavigation />
      </SidebarContent>
      <SidebarFooter>
        <SidebarAppearance />
        <User user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}

export default AppSidebar
