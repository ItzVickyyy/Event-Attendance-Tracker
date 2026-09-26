import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export const Route = createFileRoute("/_layout/scanner/time-in")({ component: TimeInWorkspace })
function TimeInWorkspace() { const navigate = useNavigate(); return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Time-In</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Time-In is handled by the existing attendance scanner flow and the event's configured attendance mode.</p><Button onClick={() => navigate({ to: "/scanner", search: { event_id: undefined } })}>Open scanning workspace</Button></CardContent></Card></div> }
