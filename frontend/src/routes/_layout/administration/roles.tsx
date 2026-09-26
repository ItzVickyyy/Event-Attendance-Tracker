import { createFileRoute } from "@tanstack/react-router"
import { RolesAdministrationPage } from "@/components/Administration/RolesAdministrationPage"
export const Route = createFileRoute("/_layout/administration/roles")({ component: RolesAdministrationPage })
