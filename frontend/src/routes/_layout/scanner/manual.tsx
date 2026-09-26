import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export const Route = createFileRoute("/_layout/scanner/manual")({ component: ManualWorkspace })
function ManualWorkspace() { const navigate = useNavigate(); return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Manual Entry</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Use the existing manual attendee lookup and attendance submission flow.</p><Button onClick={() => navigate({ to: "/scanner" })}>Open scanning workspace</Button></CardContent></Card></div> }
