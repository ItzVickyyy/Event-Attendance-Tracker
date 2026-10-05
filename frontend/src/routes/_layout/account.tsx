import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/account")({
  component: Account,
  head: () => ({ meta: [{ title: "My Account - Event Attendance Tracker" }] }),
})

function Account() {
  const { user } = useAuth()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ["my-account"], queryFn: async () => (await fetch("/api/v1/users/me", { headers: { Authorization: "Bearer " + localStorage.getItem("access_token") } })).json() })
  const profile = query.data ?? user
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  if (profile && !fullName && !email) { setFullName(profile.full_name ?? ""); setEmail(profile.email ?? "") }

  const saveProfile = async () => {
    const response = await fetch("/api/v1/users/me", { method: "PATCH", headers: { Authorization: "Bearer " + localStorage.getItem("access_token"), "Content-Type": "application/json" }, body: JSON.stringify({ full_name: fullName, email }) })
    if (!response.ok) { const body = await response.json().catch(() => null); toast.error(body?.detail ?? "Unable to update account"); return }
    toast.success("Account updated")
    await client.invalidateQueries({ queryKey: ["currentUser"] })
    await client.invalidateQueries({ queryKey: ["my-account"] })
  }
  const changePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error("New passwords do not match"); return }
    const response = await fetch("/api/v1/users/me/password", { method: "PATCH", headers: { Authorization: "Bearer " + localStorage.getItem("access_token"), "Content-Type": "application/json" }, body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
    if (!response.ok) { const body = await response.json().catch(() => null); toast.error(body?.detail ?? "Unable to change password"); return }
    toast.success("Password changed")
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("")
    await client.invalidateQueries({ queryKey: ["currentUser"] })
  }

  return <div className="max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-semibold tracking-tight">My Account</h1><p className="mt-1 text-sm text-muted-foreground">Update your personal information and password.</p></div>
    <Card><CardHeader><CardTitle>Personal Information</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="full-name">Name</Label><Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="account-email">Email</Label><Input id="account-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><Button onClick={() => void saveProfile()}>Save changes</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>Change Password</CardTitle></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="current-password">Current password</Label><Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div><Button onClick={() => void changePassword()}>Change password</Button></CardContent></Card>
  </div>
}
