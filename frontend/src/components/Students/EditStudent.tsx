import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Edit } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import type { StudentPublic } from "@/client"
import { StudentsService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { LoadingButton } from "@/components/ui/loading-button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const schema = z.object({
  student_number: z.string().min(1, "Student number is required"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  middle_name: z.string().optional().or(z.literal("")),
  extension: z.string().optional().or(z.literal("")),
  year: z.string().min(1, "Year is required"),
  section: z.string().min(1, "Section is required"),
  nfc_uid: z.string().optional().or(z.literal("")),
})

type FormData = z.infer<typeof schema>

interface EditStudentProps {
  student: StudentPublic
}

export function EditStudent({ student }: EditStudentProps) {
  const router = useRouter()
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      student_number: student.student_number,
      first_name: student.first_name,
      middle_name: student.middle_name || undefined,
      last_name: student.last_name,
      extension: student.extension || undefined,
      year: student.year,
      section: student.section,
      nfc_uid: student.nfc_uid || undefined,
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      StudentsService.updateStudent({
        path: { student_id: student.id },
        body: {
          student_number: data.student_number,
          first_name: data.first_name,
          last_name: data.last_name,
          middle_name: data.middle_name || undefined,
          extension: data.extension || undefined,
          year: data.year,
          section: data.section,
          nfc_uid: data.nfc_uid || undefined,
        },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("Student updated successfully")
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update student")
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon">
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Edit Student</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="student_number" className="text-sm font-medium">
                Student Number
              </label>
              <Input
                id="student_number"
                placeholder="2024-00001"
                {...form.register("student_number")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="last_name" className="text-sm font-medium">
                Last Name
              </label>
              <Input
                id="last_name"
                placeholder="Doe"
                {...form.register("last_name")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="first_name" className="text-sm font-medium">
                First Name
              </label>
              <Input
                id="first_name"
                placeholder="John"
                {...form.register("first_name")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="middle_name" className="text-sm font-medium">
                Middle Name
              </label>
              <Input
                id="middle_name"
                placeholder="Middle"
                {...form.register("middle_name")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="extension" className="text-sm font-medium">
                Extension (Jr., Sr., III, etc.)
              </label>
              <Input
                id="extension"
                placeholder="Jr."
                {...form.register("extension")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="year" className="text-sm font-medium">
                  Year
                </label>
                <Select
                  value={form.watch("year")}
                  onValueChange={form.setValue("year")}
                >
                  <SelectTrigger id="year">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Year</SelectItem>
                    <SelectItem value="2">2nd Year</SelectItem>
                    <SelectItem value="3">3rd Year</SelectItem>
                    <SelectItem value="4">4th Year</SelectItem>
                    <SelectItem value="5">5th Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="section" className="text-sm font-medium">
                  Section
                </label>
                <Select
                  value={form.watch("section")}
                  onValueChange={form.setValue("section")}
                >
                  <SelectTrigger id="section">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="D">D</SelectItem>
                    <SelectItem value="E">E</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="nfc_uid" className="text-sm font-medium">
                NFC UID
              </label>
              <Input
                id="nfc_uid"
                placeholder="8F:49:5B:74"
                {...form.register("nfc_uid")}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  form.reset({
                    student_number: student.student_number,
                    first_name: student.first_name,
                    middle_name: student.middle_name || undefined,
                    last_name: student.last_name,
                    extension: student.extension || undefined,
                    year: student.year,
                    section: student.section,
                    nfc_uid: student.nfc_uid || undefined,
                  })
                }
              >
                Cancel
              </Button>
              <LoadingButton loading={mutation.isPending} type="submit">
                Save Changes
              </LoadingButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default EditStudent
