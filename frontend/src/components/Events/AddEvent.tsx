import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { EventsService } from "@/client"
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
  event_name: z.string().min(1, "Event name is required"),
  event_date: z.string().min(1, "Event date is required"),
  start_time: z.string().optional().or(z.literal("")),
  end_time: z.string().optional().or(z.literal("")),
  attendance_mode: z.enum(["time_in_only", "time_in_time_out"]).optional(),
  status: z.enum(["draft", "open", "closed"]).optional(),
})

type FormData = z.infer<typeof schema>

export function AddEvent() {
  const router = useRouter()
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      event_name: "",
      event_date: "",
      start_time: undefined,
      end_time: undefined,
      attendance_mode: "time_in_only",
      status: "draft",
    },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      EventsService.createEvent({
        body: {
          event_name: data.event_name,
          event_date: data.event_date,
          start_time: data.start_time || undefined,
          end_time: data.end_time || undefined,
          attendance_mode: data.attendance_mode,
          status: data.status,
        },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("Event created successfully")
      form.reset({
        event_name: "",
        event_date: "",
        start_time: undefined,
        end_time: undefined,
        attendance_mode: "time_in_only",
        status: "draft",
      })
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create event")
    },
  })

  const onSubmit = (data: FormData) => {
    mutation.mutate(data)
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="event_name" className="text-sm font-medium">
                Event Name
              </label>
              <Input
                id="event_name"
                placeholder="CCS Week 2026"
                {...form.register("event_name")}
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="event_date" className="text-sm font-medium">
                Event Date
              </label>
              <Input
                id="event_date"
                type="date"
                {...form.register("event_date")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="start_time" className="text-sm font-medium">
                  Start Time
                </label>
                <Input
                  id="start_time"
                  type="time"
                  {...form.register("start_time")}
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="end_time" className="text-sm font-medium">
                  End Time
                </label>
                <Input
                  id="end_time"
                  type="time"
                  {...form.register("end_time")}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="attendance_mode" className="text-sm font-medium">
                Attendance Mode
              </label>
              <Select
                value={form.watch("attendance_mode")}
                onValueChange={form.setValue("attendance_mode")}
              >
                <SelectTrigger id="attendance_mode">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="time_in_only">Time-In Only</SelectItem>
                  <SelectItem value="time_in_time_out">
                    Time-In + Time-Out
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="status" className="text-sm font-medium">
                Status
              </label>
              <Select
                value={form.watch("status")}
                onValueChange={form.setValue("status")}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  form.reset({
                    event_name: "",
                    event_date: "",
                    start_time: undefined,
                    end_time: undefined,
                    attendance_mode: "time_in_only",
                    status: "draft",
                  })
                }
              >
                Cancel
              </Button>
              <LoadingButton loading={mutation.isPending} type="submit">
                Create Event
              </LoadingButton>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddEvent
