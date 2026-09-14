import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { UserPlus } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

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

export function AddStudent() {
  const router = useRouter()
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      student_number: "",
      first_name: "",
      middle_name: undefined,
      last_name: "",
      extension: undefined,
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const personRes = await PeopleService.createPerson({
        body: {
          first_name: data.first_name,
          last_name: data.last_name,
          middle_name: data.middle_name || null,
          name_extension: data.extension || null,
        },
        throwOnError: true,
      })
      const personId = (personRes as unknown as { data: { id: string } }).data
        .id
      return StudentsService.createStudent({
        body: {
          person_id: personId,
          student_number: data.student_number,
          section_id: null,
        },
        throwOnError: true,
      })
    },
    onSuccess: () => {
      toast.success("Student created successfully")
      form.reset({
        student_number: "",
        first_name: "",
        middle_name: undefined,
        last_name: "",
        extension: undefined,
      })
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create student")
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Add New Student</DialogTitle>
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
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
              >
                Cancel
              </Button>
              <LoadingButton loading={mutation.isPending} type="submit">
                Create Student
              </LoadingButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddStudent
