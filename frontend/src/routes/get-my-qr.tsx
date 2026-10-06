import { createFileRoute, Link } from "@tanstack/react-router"
import { QrCode, Search, Download } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Result = { student_number: string; full_name: string; section: string; credential_value: string }

export const Route = createFileRoute("/get-my-qr")({ component: GetMyQr })

const qrUrl = (value: string) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(value)}`

function GetMyQr() {
  const [number, setNumber] = useState("")
  const [name, setName] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)

  async function lookup(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/v1/public/student-qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_number: number.trim(), full_name: name.trim() }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok) throw new Error(body?.detail ?? "Student record not found.")
      setResult(body as Result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to retrieve your QR code.")
    } finally {
      setLoading(false)
    }
  }

  async function download() {
    if (!result) return
    try {
      const response = await fetch(qrUrl(result.credential_value))
      if (!response.ok) throw new Error("Unable to prepare the QR image.")
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${result.student_number}-QR.png`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download the QR code.")
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <QrCode className="mx-auto mb-2 size-10 text-primary" />
          <CardTitle className="text-2xl">Get My QR Code</CardTitle>
          <CardDescription>Enter your student number and full name to retrieve your registered QR code.</CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <form onSubmit={lookup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="student-number">Student Number</Label>
                <Input id="student-number" value={number} onChange={(e) => setNumber(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="full-name">Full Name</Label>
                <Input id="full-name" value={name} onChange={(e) => setName(e.target.value)} required />
                <p className="text-xs text-muted-foreground">Use the name registered in the attendance system.</p>
              </div>
              <Button className="w-full" disabled={loading}>
                <Search className="size-4" />
                {loading ? "Checking..." : "Find My QR Code"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <img src={qrUrl(result.credential_value)} alt={`QR code for ${result.full_name}`} className="mx-auto aspect-square w-full max-w-72" />
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">{result.full_name}</p>
                <p className="text-muted-foreground">{result.student_number} · {result.section}</p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void download()}><Download className="size-4" />Download QR</Button>
                <Button variant="outline" onClick={() => setResult(null)}>Search Again</Button>
              </div>
            </div>
          )}
          <div className="mt-6 border-t pt-4 text-center text-sm text-muted-foreground">
            <Link to="/login" className="underline underline-offset-4">Staff Login</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
