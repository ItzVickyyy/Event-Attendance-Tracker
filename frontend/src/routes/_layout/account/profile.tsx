import { createFileRoute } from "@tanstack/react-router"
import { AccountWorkspace } from "@/components/Account/AccountWorkspace"

export const Route = createFileRoute("/_layout/account/profile")({ component: Profile })
function Profile() { return <AccountWorkspace section="profile" /> }
