import { Skeleton } from "@/components/ui/skeleton"

export function PendingDashboard() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-8 w-16 mt-4" />
            <Skeleton className="h-4 w-28 mt-2" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border rounded-lg p-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </div>
            <Skeleton className="h-8 w-16 mt-4" />
            <Skeleton className="h-4 w-28 mt-2" />
          </div>
        ))}
      </div>
      <div className="border rounded-lg p-6">
        <Skeleton className="h-4 w-24 mb-4" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32 mt-1" />
                </div>
              </div>
              <div className="text-right">
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-3 w-16 mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PendingDashboard
