import { createFileRoute } from "@tanstack/react-router"
import { Download, QrCode, Search } from "lucide-react"
import { QRCodeCanvas } from "qrcode.react"
import { type FormEvent, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Result = {
  student_number: string
  full_name: string
  section: string
  credential_value: string
}

export const Route = createFileRoute("/get-my-qr")({ component: GetMyQr })

function GetMyQr() {
  const [number, setNumber] = useState("")
  const [firstName, setFirstName] = useState("")
  const [middleName, setMiddleName] = useState("")
  const [lastName, setLastName] = useState("")
  const [nameExtension, setNameExtension] = useState("")
  const [result, setResult] = useState<Result | null>(null)
  const qrCanvas = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)

  async function lookup(event: FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/api/v1/public/student-qr`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            student_number: number.trim(),
            first_name: firstName.trim(),
            middle_name: middleName.trim(),
            last_name: lastName.trim(),
            name_extension: nameExtension.trim(),
          }),
        },
      )
      const body = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(body?.detail ?? "Student record not found.")
      setResult(body as Result)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to retrieve your QR code.",
      )
    } finally {
      setLoading(false)
    }
  }

  function download() {
    const canvas = qrCanvas.current
    if (!result || !canvas) {
      toast.error("Unable to prepare the QR image.")
      return
    }

    try {
      const anchor = document.createElement("a")
      anchor.href = canvas.toDataURL("image/png")
      anchor.download = `${result.student_number}-QR.png`
      anchor.click()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to download the QR code.",
      )
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <QrCode className="mx-auto mb-2 size-10 text-primary" />
          <CardTitle className="text-2xl">Get My QR Code</CardTitle>
          <CardDescription>
            Enter your student number, first name, and last name as registered.
            Middle name is optional. You can enter the full middle name or its
            initial with or without a period.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result ? (
            <form onSubmit={lookup} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="student-number">Student Number</Label>
                <Input
                  id="student-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First Name</Label>
                  <Input
                    id="first-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="middle-name">Middle Name</Label>
                  <Input
                    id="middle-name"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    autoComplete="additional-name"
                    placeholder="Optional, e.g. R or R."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last Name</Label>
                  <Input
                    id="last-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name-extension">Name Extension</Label>
                  <Input
                    id="name-extension"
                    value={nameExtension}
                    onChange={(e) => setNameExtension(e.target.value)}
                    placeholder="Optional, e.g. Jr."
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                First and last names must match your student record. Middle name
                can be left blank or entered as a full name or initial.
              </p>
              <Button className="w-full" disabled={loading}>
                <Search className="size-4" />
                {loading ? "Checking..." : "Find My QR Code"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="mx-auto aspect-square w-full max-w-72">
                <QRCodeCanvas
                  ref={qrCanvas}
                  value={result.credential_value}
                  size={600}
                  level="M"
                  includeMargin
                  title={`QR code for ${result.full_name}`}
                  className="block !h-full !w-full"
                  style={{ height: "100%", width: "100%" }}
                />
              </div>
              <div className="rounded-lg border p-4 text-sm">
                <p className="font-medium">{result.full_name}</p>
                <p className="text-muted-foreground">
                  {result.student_number} · {result.section}
                </p>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={download}>
                  <Download className="size-4" />
                  Download QR
                </Button>
                <Button variant="outline" onClick={() => setResult(null)}>
                  Search Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
