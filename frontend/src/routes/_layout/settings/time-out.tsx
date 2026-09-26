import { createFileRoute } from "@tanstack/react-router"
import { SettingCapabilityPage } from "@/components/Settings/SettingCapabilityPage"

export const Route = createFileRoute("/_layout/settings/time-out")({ component: TimeOutSettings })
function TimeOutSettings() { return <SettingCapabilityPage title="Time-Out Settings" description="System-level time-out configuration." capability="The current frontend client does not expose a persisted time-out settings resource." /> }
