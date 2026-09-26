import { createFileRoute } from "@tanstack/react-router"
import { UsersAdministrationPage } from "@/components/Administration/UsersAdministrationPage"
export const Route = createFileRoute("/_layout/administration/users")({ component: UsersAdministrationPage })
