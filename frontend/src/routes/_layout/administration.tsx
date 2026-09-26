import { createFileRoute } from "@tanstack/react-router"
import { AdministrationWorkspace } from "@/components/Administration/AdministrationWorkspace"
export const Route = createFileRoute("/_layout/administration")({ component: AdministrationWorkspace })
