import { createFileRoute } from "@tanstack/react-router"
import { SystemSettingsWorkspace } from "@/components/Settings/SystemSettingsWorkspace"

export const Route = createFileRoute("/_layout/settings/")({ component: SettingsHome })
function SettingsHome() { return <SystemSettingsWorkspace /> }
