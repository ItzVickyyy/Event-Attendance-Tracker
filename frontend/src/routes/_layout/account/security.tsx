import { createFileRoute } from "@tanstack/react-router"
import { AccountWorkspace } from "@/components/Account/AccountWorkspace"

export const Route = createFileRoute("/_layout/account/security")({ component: Security })
function Security() { return <AccountWorkspace section="security" /> }
