import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Edit } from "lucide-react"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import type { StudentPublic } from "@/client"
import { PeopleService, StudentsService } from "@/client"
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

const schema = z.object({
  student_number: z.string().min(1, "Student number is required"),
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  middle_name: z.string().optional().or(z.literal("")),
  extension: z.string().optional().or(z.literal("")),
})

type FormData = z.infer<typeof schema>

interface EditStudentProps {
  student: StudentPublic
}

type StudentRow = StudentPublic & {
  first_name?: string
  last_name?: string
  middle_name?: string | null
  extension?: string | null
}

export function EditStudent({ student }: EditStudentProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const row = student as StudentRow

  const personId: string | undefined = student.person_id

  const personQuery = useQuery({
    queryKey: ["person", personId] as const,
    queryFn: async () => {
      if (!personId) throw new Error("Student has no linked person")
      return (await PeopleService.readPerson({
        path: { person_id: personId },
        throwOnError: true,
      })) as unknown as {
        first_name: string
        last_name: string
        middle_name: string | null
        name_extension: string | null
      }
    },
    enabled: isOpen && !!personId,
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      student_number: student.student_number,
      first_name: row.first_name ?? "",
      middle_name: row.middle_name ?? undefined,
      last_name: row.last_name ?? "",
      extension: row.extension ?? undefined,
    },
  })

  useEffect(() => {
    if (!isOpen) return
    const p = personQuery.data
    if (p) {
      form.reset({
        student_number: student.student_number,
        first_name: p.first_name ?? row.first_name ?? "",
        last_name: p.last_name ?? row.last_name ?? "",
        middle_name: p.middle_name ?? row.middle_name ?? undefined,
        extension: p.name_extension ?? row.extension ?? undefined,
      })
    }
  }, [
    isOpen,
    personQuery.data,
    student.student_number,
    row.first_name,
    row.last_name,
    row.middle_name,
    row.extension,
    form,
  ])

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!personId) throw new Error("Student has no linked person")
      await PeopleService.updatePerson({
        path: { person_id: personId },
        body: {
          first_name: data.first_name,
          last_name: data.last_name,
          middle_name: data.middle_name || null,
          name_extension: data.extension || null,
        },
        throwOnError: true,
      })
      return StudentsService.updateStudent({
        path: { student_id: student.id },
        body: {
          student_number: data.student_number,
        },
        throwOnError: true,
      })
    },
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
            {student.section_id ? (
              <div className="grid gap-2">
                <div className="text-xs text-muted-foreground">
                  Current section ID: {student.section_id}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const p = personQuery.data
                  form.reset({
                    student_number: student.student_number,
                    first_name: p?.first_name ?? row.first_name ?? "",
                    middle_name: p?.middle_name ?? row.middle_name ?? undefined,
                    last_name: p?.last_name ?? row.last_name ?? "",
                    extension: p?.name_extension ?? row.extension ?? undefined,
                  })
                }}
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
