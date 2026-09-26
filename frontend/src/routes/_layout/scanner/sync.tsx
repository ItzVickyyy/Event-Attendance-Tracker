import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export const Route = createFileRoute("/_layout/scanner/sync")({ component: SyncWorkspace })
function SyncWorkspace() { const navigate = useNavigate(); return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>Offline / Sync</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">The existing scanner workspace remains the source of truth for queued scans, synchronization, retries, and offline roster state.</p><Button onClick={() => navigate({ to: "/scanner" })}>Open sync workspace</Button></CardContent></Card></div> }
