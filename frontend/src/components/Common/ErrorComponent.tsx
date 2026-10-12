import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

const ErrorComponent = ({ error }: { error?: Error }) => {
  return (
    <div
      className="flex min-h-screen items-center justify-center flex-col p-4"
      data-testid="error-component"
    >
      <div className="flex items-center z-10">
        <div className="flex flex-col ml-4 items-center justify-center p-4">
          <span className="text-6xl md:text-8xl font-bold leading-none mb-4">
            Error
          </span>
          <span className="text-2xl font-bold mb-2">Oops!</span>
        </div>
      </div>

      <p className="text-lg text-muted-foreground mb-4 text-center z-10">
        Something went wrong. Please try again.
      </p>
      {import.meta.env.DEV && error && (
        <pre className="mb-4 max-w-full overflow-auto rounded border p-3 text-sm">
          {error.message}
        </pre>
      )}
      <Link to="/">
        <Button>Go Home</Button>
      </Link>
    </div>
  )
}

export default ErrorComponent
