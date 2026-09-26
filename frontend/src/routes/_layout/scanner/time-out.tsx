import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export const Route = createFileRoute("/_layout/scanner/time-out")({ component: TimeOutWorkspace })
function TimeOutWorkspace() { const navigate = useNavigate(); return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Time-Out</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Time-Out is available only when the selected event uses Time-In / Time-Out attendance.</p><Button onClick={() => navigate({ to: "/scanner", search: { event_id: undefined } })}>Open scanning workspace</Button></CardContent></Card></div> }
