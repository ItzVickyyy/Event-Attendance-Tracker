import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { AlertTriangle, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"
import type { StudentTableRow } from "./columns"
import { formatName } from "./columns"

interface DeleteStudentProps {
  student: StudentTableRow
}

export function DeleteStudent({ student }: DeleteStudentProps) {
  const router = useRouter()

  const mutation = useMutation({
    mutationFn: () =>
      StudentsService.deleteStudent({
        path: { student_id: student.id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("Student deleted successfully")
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete student")
    },
  })

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <DialogTitle className="text-center">Delete Student</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to delete{" "}
            <strong>{formatName(student.person)}</strong>(
            {student.student_number})? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 py-4">
          <Button variant="outline" onClick={() => {}}>
            Cancel
          </Button>
          <LoadingButton
            loading={mutation.isPending}
            variant="destructive"
            onClick={() => mutation.mutate()}
          >
            Delete
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default DeleteStudent
