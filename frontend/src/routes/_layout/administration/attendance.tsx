import { createFileRoute } from "@tanstack/react-router"
import { AttendanceAdministrationPage } from "@/components/Administration/AttendanceAdministrationPage"
export const Route = createFileRoute("/_layout/administration/attendance")({ component: AttendanceAdministrationPage })
