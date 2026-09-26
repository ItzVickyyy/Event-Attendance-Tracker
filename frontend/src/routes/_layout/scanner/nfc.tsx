import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/_layout/scanner/nfc")({ component: NfcWorkspace })
function NfcWorkspace() { const navigate = useNavigate(); return <Workspace title="NFC" description="Use the existing NFC scanner engine for the selected event." onOpen={() => navigate({ to: "/scanner", search: { event_id: undefined } })} /> }
function Workspace({ title, description, onOpen }: { title: string; description: string; onOpen: () => void }) { return <div className="mx-auto max-w-3xl"><Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{description}</p><Button onClick={onOpen}>Open scanning workspace</Button></CardContent></Card></div> }
