import { createFileRoute } from "@tanstack/react-router"
import { AccountWorkspace } from "@/components/Account/AccountWorkspace"

export const Route = createFileRoute("/_layout/account/")({ component: Account })
function Account() { return <AccountWorkspace /> }
