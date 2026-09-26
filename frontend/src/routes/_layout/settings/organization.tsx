import { createFileRoute } from "@tanstack/react-router"
import { SettingCapabilityPage } from "@/components/Settings/SettingCapabilityPage"

export const Route = createFileRoute("/_layout/settings/organization")({ component: OrganizationSettings })
function OrganizationSettings() { return <SettingCapabilityPage title="Organization Settings" description="Organization-level configuration." capability="The current frontend client does not expose a persisted organization-settings resource." /> }
