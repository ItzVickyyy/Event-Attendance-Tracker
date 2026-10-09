import { createFileRoute } from "@tanstack/react-router"
import { ClassRepresentativesAdmin } from "@/components/Administration/ClassRepresentativesAdmin"

export const Route = createFileRoute(
  "/_layout/administration/class-representatives",
)({
  component: ClassRepresentativesAdmin,
  head: () => ({
    meta: [{ title: "Class Representatives - Event Attendance Tracker" }],
  }),
})
