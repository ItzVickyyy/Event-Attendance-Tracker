import { useMutation } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { AlertTriangle, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import type { EventPublic } from "@/client"
import { EventsService } from "@/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { LoadingButton } from "@/components/ui/loading-button"

interface DeleteEventProps {
  event: EventPublic
}

export function DeleteEvent({ event }: DeleteEventProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const mutation = useMutation({
    mutationFn: () =>
      EventsService.deleteEvent({
        path: { event_id: event.id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.success("Event deleted successfully")
      setOpen(false)
      router.invalidate()
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete event")
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          aria-label={`Delete ${event.event_name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <DialogTitle className="text-center">Delete Event</DialogTitle>
          <DialogDescription className="text-center">
            Are you sure you want to delete <strong>{event.event_name}</strong>?
            This action cannot be undone and will delete all attendance records
            for this event.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
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

export default DeleteEvent
