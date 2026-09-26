import { createFileRoute } from "@tanstack/react-router"
import { SettingCapabilityPage } from "@/components/Settings/SettingCapabilityPage"

export const Route = createFileRoute("/_layout/settings/attendance-rules")({ component: AttendanceRules })
function AttendanceRules() { return <SettingCapabilityPage title="Attendance Rules" description="Attendance timing rules and thresholds." capability="The current frontend client does not expose a persisted attendance-rules settings resource." /> }
