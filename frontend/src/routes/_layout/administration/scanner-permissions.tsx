import { createFileRoute } from "@tanstack/react-router"
import { ScannerPermissionsPage } from "@/components/Administration/ScannerPermissionsPage"
export const Route = createFileRoute("/_layout/administration/scanner-permissions")({ component: ScannerPermissionsPage })
